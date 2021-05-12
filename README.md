# OSM Extractor
_extract road graph from OSM snip_

The extractor accepts both OSM XML and OSM PBF formats.
While it can operate on raw extract, it is preferable (for faster processing) to pre-filter data to only include ways tagged "highway" (and used nodes).
For example, with [Osmosis](https://wiki.openstreetmap.org/wiki/Osmosis):
```sh
osmosis --read-xml "$1" --lp interval=60 label="ways " --tf accept-ways highway=* --lp interval=60 label="nodes " --used-node --write-xml file="$1.roads.osm"
```
(or PBF)
```sh
osmosis --read-pbf-fast workers=8 "$1" --lp interval=60 label="ways " --tf accept-ways highway=* --lp interval=60 label="nodes " --used-node --write-xml file="$1.roads.osm"
```

The extractor runs on Node.
Run
```sh
node extract.js
```
to get started

## Example usage
1. download Montreal area from [Overpass](https://overpass-api.de/api/map?bbox=-74.1660,45.2536,-73.2060,45.8652) and save as `montreal.osm`
2. (optional) Run it through osmosis `osmosis --read-xml "montreal.osm" --lp interval=60 label="ways " --tf accept-ways highway=* --lp interval=60 label="nodes " --used-node --write-xml file="montreal.roads.osm"`
3. run the extractor script `node extract.js montreal.roads.osm montreal.roads.json --nodes`
4. you now have the montreal road network graph in `montreal.roads.json`!
