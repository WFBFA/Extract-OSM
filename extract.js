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
	roads.push({
		p1: way.nodeRefs[0],
		p2: way.nodeRefs[way.nodeRefs.length-1],
		directed: way.tags.oneway === 'yes',
		segments: way.nodeRefs,
		sidewalks: way.tags.sidewalk === 'both' ? [true, true] : way.tags.sidewalk === 'left' ? [true, false] : way.tags.sidewalk === 'right' ? [false, true] : [false, false],
	});
}

function finalize(file, roads, nodes, simplify, includeNodes){
	console.log("Populating distances")
	for(let r of roads){
		let segments = r.segments;
		delete r.segments;
		let d = 0;
		for(let i = 0; i < segments.length-1; i++){
			let p1 = nodes.get(segments[i]);
			let p2 = nodes.get(segments[i+1]);
			if(!p1 || !p2) throw new Error("Incomplete data!");
			d += haversine(p1.coordinates, p2.coordinates);
		}
		r.distance = d;
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
	console.log(usefulNodes ? `Exporting (${roads.length} roads and ${nodes.size} nodes)` : `Exporting (${roads.length} roads)`);
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
						console.error(message);
						process.exit(1);
					},
					endDocument: () => {
						finalize(args.output, roads, nodes, args.simplify, args.nodes);
					},
				});
			},
		});
	})
	.help()
	.alias('help', 'h')
	.demandCommand(1)
	.argv;
