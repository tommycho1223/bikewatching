// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoidGx3YyIsImEiOiJjbTc4b3o4d2gxZG5vMmtwdjkwZWI0OGdkIn0.a4s22vqdgYwi1S55ntLXqQ';

// Initialize the map
const map = new mapboxgl.Map({
    container: 'map', // ID of the div where the map will render
    style: 'mapbox://styles/mapbox/streets-v12', // Map style
    center: [-71.09415, 42.36027], // [longitude, latitude]
    zoom: 12, // Initial zoom level
    minZoom: 5, // Minimum allowed zoom
    maxZoom: 18 // Maximum allowed zoom
});

// Define common styling for bike lanes
const bikeLaneStyle = {
    'line-color': '#32D400', // Brighter green
    'line-width': 5, // Thicker lines
    'line-opacity': 0.6 // Slightly less transparent
};

map.on('load', () => {
    map.addSource('boston_route', {
        type: 'geojson',
        data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson?...'
    });

    // Add Cambridge bike lane data source
    map.addSource('cambridge_route', {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
    });

    // Add Boston bike lanes layer
    map.addLayer({
        id: 'bike-lanes-boston',
        type: 'line',
        source: 'boston_route',
        paint: bikeLaneStyle
    });
    
    // Add Cambridge bike lanes layer
    map.addLayer({
        id: 'bike-lanes-cambridge',
        type: 'line',
        source: 'cambridge_route',
        paint: bikeLaneStyle
    });

    // Fetch and parse Bluebike station data using D3.js
    const stationUrl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
    const trafficUrl = 'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv';

    Promise.all([d3.json(stationUrl), d3.csv(trafficUrl)]).then(([stationData, trafficData]) => {
        console.log('Loaded Stations:', stationData);
        console.log('Loaded Traffic Data:', trafficData);

        let stations = stationData.data.stations;

        // Calculate departures, arrivals, and total traffic per station
        const departures = d3.rollup(trafficData, v => v.length, d => d.start_station_id);
        const arrivals = d3.rollup(trafficData, v => v.length, d => d.end_station_id);

        stations = stations.map((station) => {
            let id = station.short_name;
            station.arrivals = arrivals.get(id) ?? 0;
            station.departures = departures.get(id) ?? 0;
            station.totalTraffic = station.arrivals + station.departures;
            return station;
        });

        console.log('Updated Stations with Traffic Data:', stations);

        // Define a square root scale for circle size
        const radiusScale = d3.scaleSqrt()
            .domain([0, d3.max(stations, d => d.totalTraffic)])
            .range([0, 25]);

        // Append circles to the SVG for each station
        const circles = svg.selectAll('circle')
            .data(stations)
            .enter()
            .append('circle')
            .attr('fill', 'steelblue') // Circle fill color
            .attr('stroke', 'white') // Circle border color
            .attr('stroke-width', 1) // Circle border thickness
            .attr('fill-opacity', 0.6) // Adjust fill opacity
            .attr('r', d => radiusScale(d.totalTraffic)); // Scale radius dynamically

        // Add tooltips to circles
        circles.each(function(d) {
            d3.select(this)
                .append('title')
                .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
        });

        // Function to convert station coordinates to pixel coordinates
        function getCoords(station) {
            const point = new mapboxgl.LngLat(+station.lon, +station.lat); // Convert lon/lat to Mapbox LngLat
            const { x, y } = map.project(point); // Convert to pixel coordinates
            return { cx: x, cy: y };
        }

        // Function to update circle positions when the map moves/zooms
        function updatePositions() {
            circles
                .attr('cx', d => getCoords(d).cx) // Set the x-position using projected coordinates
                .attr('cy', d => getCoords(d).cy); // Set the y-position using projected coordinates
        }

        // Initial position update when map loads
        updatePositions();

        // Reposition markers on map interactions
        map.on('move', updatePositions); // Update during map movement
        map.on('zoom', updatePositions); // Update during zooming
        map.on('resize', updatePositions); // Update on window resize
        map.on('moveend', updatePositions); // Final adjustment after movement ends
    }).catch(error => {
        console.error('Error loading JSON or CSV:', error); // Handle errors
    });

    // Overlay an SVG layer on the map
    const svg = d3.select('#map').append('svg')
        .style('position', 'absolute')
        .style('z-index', 1)
        .style('width', '100%')
        .style('height', '100%')
        .style('pointer-events', 'none');
});
