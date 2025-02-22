// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoidGx3YyIsImEiOiJjbTc4b3o4d2gxZG5vMmtwdjkwZWI0OGdkIn0.a4s22vqdgYwi1S55ntLXqQ';

// Initialize the map
const map = new mapboxgl.Map({
    container: 'map', // ID of the div where the map will render
    style: 'mapbox://styles/mapbox/streets-v12', // Map style
    center: [-71.09415, 42.36027], // [longitude, latitude]
    zoom: 12, // Initial zoom level
    minZoom: 5,
    maxZoom: 18
});

// Define common styling for bike lanes
const bikeLaneStyle = {
    'line-color': '#32D400',
    'line-width': 5,
    'line-opacity': 0.6
};

map.on('load', () => {
    map.addSource('boston_route', {
        type: 'geojson',
        data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson?...'
    });

    map.addSource('cambridge_route', {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
    });

    map.addLayer({
        id: 'bike-lanes-boston',
        type: 'line',
        source: 'boston_route',
        paint: bikeLaneStyle
    });

    map.addLayer({
        id: 'bike-lanes-cambridge',
        type: 'line',
        source: 'cambridge_route',
        paint: bikeLaneStyle
    });

    const stationUrl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
    const trafficUrl = 'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv';

    // Load both datasets
    Promise.all([
        d3.json(stationUrl),
        d3.csv(trafficUrl, trip => ({
            ...trip,
            started_at: new Date(trip.started_at),
            ended_at: new Date(trip.ended_at)
        }))
    ]).then(([stationData, trafficData]) => {
        console.log('Loaded Stations:', stationData);
        console.log('Loaded Traffic Data:', trafficData);

        let stations = stationData.data.stations;
        let trips = trafficData;

        // Compute initial station traffic
        stations = computeStationTraffic(stations, trips);

        // Scale for circle radius
        const radiusScale = d3.scaleSqrt()
            .domain([0, d3.max(stations, d => d.totalTraffic)])
            .range([0, 25]);

        // Create SVG overlay
        const svg = d3.select('#map').append('svg')
            .style('position', 'absolute')
            .style('z-index', 1)
            .style('width', '100%')
            .style('height', '100%')
            .style('pointer-events', 'none');

        // Append circles to the map
        const circles = svg.selectAll('circle')
            .data(stations, d => d.short_name)
            .enter()
            .append('circle')
            .attr('fill', 'steelblue')
            .attr('stroke', 'white')
            .attr('stroke-width', 1)
            .attr('fill-opacity', 0.6)
            .attr('r', d => radiusScale(d.totalTraffic))
            .each(function(d) {
                d3.select(this)
                    .append('title')
                    .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
            });

        // Function to convert station coordinates
        function getCoords(station) {
            const point = new mapboxgl.LngLat(+station.lon, +station.lat);
            const { x, y } = map.project(point);
            return { cx: x, cy: y };
        }

        // Function to update circle positions
        function updatePositions() {
            circles.attr('cx', d => getCoords(d).cx)
                   .attr('cy', d => getCoords(d).cy);
        }

        // Update on map movements
        updatePositions();
        map.on('move', updatePositions);
        map.on('zoom', updatePositions);
        map.on('resize', updatePositions);
        map.on('moveend', updatePositions);

        // Step 5.2: Reactivity - Adding Slider Functionality
        const timeSlider = document.getElementById("time-slider");
        const selectedTime = document.getElementById("selected-time");
        const anyTimeLabel = document.getElementById("any-time");

        let timeFilter = -1;

        function formatTime(minutes) {
            const date = new Date(0, 0, 0, 0, minutes);
            return date.toLocaleTimeString('en-US', { timeStyle: 'short' });
        }

        function updateTimeDisplay() {
            timeFilter = Number(timeSlider.value);

            if (timeFilter === -1) {
                selectedTime.textContent = "";
                anyTimeLabel.style.display = "block";
            } else {
                selectedTime.textContent = formatTime(timeFilter);
                anyTimeLabel.style.display = "none";
            }

            updateScatterPlot(timeFilter);
        }

        timeSlider.addEventListener("input", updateTimeDisplay);
        updateTimeDisplay();

        // Step 5.3: Implement Filtering Logic
        function computeStationTraffic(stations, trips) {
            const departures = d3.rollup(trips, v => v.length, d => d.start_station_id);
            const arrivals = d3.rollup(trips, v => v.length, d => d.end_station_id);

            return stations.map(station => {
                let id = station.short_name;
                station.arrivals = arrivals.get(id) ?? 0;
                station.departures = departures.get(id) ?? 0;
                station.totalTraffic = station.arrivals + station.departures;
                return station;
            });
        }

        function minutesSinceMidnight(date) {
            return date.getHours() * 60 + date.getMinutes();
        }

        function filterTripsByTime(trips, timeFilter) {
            return timeFilter === -1 ? trips : trips.filter(trip => {
                const startedMinutes = minutesSinceMidnight(trip.started_at);
                const endedMinutes = minutesSinceMidnight(trip.ended_at);
                return Math.abs(startedMinutes - timeFilter) <= 60 || Math.abs(endedMinutes - timeFilter) <= 60;
            });
        }

        function updateScatterPlot(timeFilter) {
            const filteredTrips = filterTripsByTime(trips, timeFilter);
            const filteredStations = computeStationTraffic(stations, filteredTrips);

            // Adjust circle size scale
            timeFilter === -1 ? radiusScale.range([0, 25]) : radiusScale.range([3, 50]);

            // Update the scatterplot
            circles.data(filteredStations, d => d.short_name)
                .join('circle')
                .attr('r', d => radiusScale(d.totalTraffic));
        }
    }).catch(error => {
        console.error('Error loading data:', error);
    });
});
