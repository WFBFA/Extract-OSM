"use strict";
import fs, { watch } from 'fs';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import osm from 'osm-read';
import haversine from 'haversine-distance'

function processWay(way, roads, nodes){
	const highway = way.tags.highway;
	switch(highway){
		case 'motorway':
		case 'motorway_link':
		case 'trunk':
		case 'trunk_link':
		case 'primary':
		case 'primary_link':
		case 'secondary':
		case 'secondary_link':
		case 'tertiary':
		case 'tertiary_link':
		case 'unclassified':
		case 'residential':
		case 'living_street':
			break;
		default:
			return;
	}
	for(let n of way.nodeRefs) nodes.set(n, {});
	for(let i = 0; i < way.nodeRefs.length-1; i++) roads.push({
		p1: way.nodeRefs[i],
		p2: way.nodeRefs[i+1],
		directed: way.tags.oneway === 'yes',
		sidewalks: way.tags.sidewalk === 'both' ? [true, true] : way.tags.sidewalk === 'left' ? [true, false] : way.tags.sidewalk === 'right' ? [false, true] : [false, false],
	});
}

function finalize(file, roads, nodes, simplify, includeNodes){
	console.log("Populating distances")
	for(let r of roads){
		const p1 = nodes.get(r.p1);
		const p2 = nodes.get(r.p2);
		if(!p1 || !p2) throw new Error("Incomplete data!");
		r.distance = haversine(p1.coordinates, p2.coordinates);
	}
	//TODO simplify?
	const usefulNodes = includeNodes ? (function(){
		console.log("Stripping intermediate nodes");
		const retain = [];
		const yum = (p) => {
			if(p){
				nodes.delete(p.id);
				retain.push(p);
			}
		};
		for(let r of roads){
			yum(nodes.get(r.p1));
			yum(nodes.get(r.p2));
		}
		return retain;
	})() : undefined;
	console.log(usefulNodes ? `Exporting (${roads.length} roads and ${usefulNodes.length} nodes)` : `Exporting (${roads.length} roads)`);
	fs.writeFileSync(file, JSON.stringify({
		roads,
		nodes: usefulNodes,
	}));
}

const argv = yargs(hideBin(process.argv))
	.command('extract <input> <output>', 'extract and transform OSM data', (yargs) => {
		return yargs
			.positional('input', { description: "OSM input data file (XML or PBF)" }).string('input')
			.positional('output', { description: "Output JSON file" }).string('output')
			.boolean('nodes').describe('nodes', "Include nodes information in the export").default('nodes', false)
			.boolean('simplify').describe('simplify', "Simplify road geometry").default('simplify', true);
	}, (args) => {
		const nodes = new Map();
		const roads = [];
		console.log("First pass");
		(args.input.endsWith(".osm") ? osm.parseXml : osm.parse)({
			filePath: args.input,
			way: (way) => processWay(way, roads, nodes),
			error: (message) => {
				console.error(message);
				process.exit(1);
			},
			endDocument: () => {
				console.log("Second pass");
				(args.input.endsWith(".osm") ? osm.parseXml : osm.parse)({
					filePath: args.input,
					node: (node) => {
						if(nodes.has(node.id)) nodes.set(node.id, {
							id: node.id,
							coordinates: [node.lon, node.lat],
						});
					},
					error: (message) => {
						throw new Error(message);
					},
					endDocument: () => {
						finalize(args.output, roads, nodes, args.simplify, args.nodes);
					},
				});
			},
		});
	})
	.command('geojson <input> <output>', "create GeoJSON from extracted data", (yargs) => {
		return yargs
			.positional('input', { description: "Input JSON file produced with `extract ... --nodes`" }).string('input')
			.positional('output', { description: "Output GeoJSON file" }).string('output');
	}, (args) => {
		const data = JSON.parse(fs.readFileSync(args.input));
		if(!data?.roads || !data?.nodes) throw new Error("Can only use complete extracted data");
		const nodes = new Map();
		for(let n of data.nodes) nodes.set(n.id, n);
		fs.writeFileSync(args.output, JSON.stringify({
			type: 'GeometryCollection',
			geometries: data.roads.map(r => ({
				type: 'LineString',
				coordinates: [nodes.get(r.p1).coordinates, nodes.get(r.p2).coordinates],
			})),
		}));
	})
	.help()
	.alias('help', 'h')
	.demandCommand(1)
	.argv;
