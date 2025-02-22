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

// Function to compute traffic for each station
function computeStationTraffic(stations, trips) {
    // Compute departures
    const departures = d3.rollup(trips, v => v.length, d => d.start_station_id);
    // Compute arrivals
    const arrivals = d3.rollup(trips, v => v.length, d => d.end_station_id);

    // Update each station with computed traffic data
    return stations.map((station) => {
        let id = station.short_name;
        station.arrivals = arrivals.get(id) ?? 0;
        station.departures = departures.get(id) ?? 0;
        station.totalTraffic = station.arrivals + station.departures;
        return station;
    });
}

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

    Promise.all([
        d3.json(stationUrl),
        d3.csv(trafficUrl, (trip) => {
            trip.started_at = new Date(trip.started_at); // Convert start time to Date object
            trip.ended_at = new Date(trip.ended_at); // Convert end time to Date object
            return trip;
        })
    ]).then(([stationData, trafficData]) => {
    
        console.log('Loaded Stations:', stationData);
        console.log('Loaded Traffic Data:', trafficData);

        let stations = computeStationTraffic(stationData.data.stations, trafficData);

        console.log('Updated Stations with Traffic Data:', stations);

        // Define a square root scale for circle size
        const radiusScale = d3.scaleSqrt()
            .domain([0, d3.max(stations, d => d.totalTraffic)])
            .range([0, 25]);

        // Append circles to the SVG for each station
        const circles = svg.selectAll('circle')
            .data(stations, d => d.short_name) // Use station short_name as the key
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

    // Step 5.2: Reactivity - Adding Slider Functionality
    const timeSlider = document.getElementById("time-slider");
    const selectedTime = document.getElementById("selected-time");
    const anyTimeLabel = document.getElementById("any-time");

    let timeFilter = -1; // Default: No filtering

    // Helper function to format time
    function formatTime(minutes) {
        const date = new Date(0, 0, 0, 0, minutes); // Set hours & minutes
        return date.toLocaleTimeString("en-US", { timeStyle: "short" }); // Format as HH:MM AM/PM
    }

    // Function to update time display based on slider value
    function updateTimeDisplay() {
        timeFilter = Number(timeSlider.value); // Get slider value

        if (timeFilter === -1) {
            selectedTime.textContent = ""; // Clear time display
            anyTimeLabel.style.display = "block"; // Show "(any time)"
        } else {
            selectedTime.textContent = formatTime(timeFilter); // Display formatted time
            anyTimeLabel.style.display = "none"; // Hide "(any time)"
        }

        // Call updateScatterPlot to reflect the changes on the map
        updateScatterPlot(timeFilter);
    }

    // Bind slider input event to function
    timeSlider.addEventListener("input", updateTimeDisplay);
    updateTimeDisplay(); // Initialize time display on page load
});

function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
}

function filterTripsByTime(trips, timeFilter) {
    return timeFilter === -1
        ? trips // If no filter is applied (-1), return all trips
        : trips.filter((trip) => {
            // Convert trip start and end times to minutes since midnight
            const startedMinutes = minutesSinceMidnight(trip.started_at);
            const endedMinutes = minutesSinceMidnight(trip.ended_at);

            // Include trips that started or ended within ±60 minutes of the selected time
            return (
                Math.abs(startedMinutes - timeFilter) <= 60 ||
                Math.abs(endedMinutes - timeFilter) <= 60
            );
        });
}

function updateScatterPlot(timeFilter) {
    // Get only the trips that match the selected time filter
    const filteredTrips = filterTripsByTime(trafficData, timeFilter);

    // Recompute station traffic based on the filtered trips
    const filteredStations = computeStationTraffic(stationData.data.stations, filteredTrips);

    // Dynamically adjust the radius scale
    timeFilter === -1 ? radiusScale.range([0, 25]) : radiusScale.range([3, 50]);

    // Update the scatterplot by adjusting the radius of circles
    circles
        .data(filteredStations, d => d.short_name) // Ensure D3 tracks elements correctly
        .join('circle')
        .attr('r', d => radiusScale(d.totalTraffic)); // Update circle sizes
}
