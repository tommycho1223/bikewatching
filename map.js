// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoidGx3YyIsImEiOiJjbTc4b3o4d2gxZG5vMmtwdjkwZWI0OGdkIn0.a4s22vqdgYwi1S55ntLXqQ';

// Initialize the map
const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [-71.09415, 42.36027],
    zoom: 12,
    minZoom: 5,
    maxZoom: 18
});

// Declare global variables for filtering logic
let circles;
let timeFilter = -1; // Default: No filtering
const stationUrl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
const trafficUrl = 'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv';

// Define bike lane styles
const bikeLaneStyle = {
    'line-color': '#32D400',
    'line-width': 5,
    'line-opacity': 0.6
};

// Function to compute traffic for each station
function computeStationTraffic(stations, trips) {
    const departures = d3.rollup(trips, v => v.length, d => d.start_station_id);
    const arrivals = d3.rollup(trips, v => v.length, d => d.end_station_id);

    return stations.map((station) => {
        let id = station.short_name;
        station.arrivals = arrivals.get(id) ?? 0;
        station.departures = departures.get(id) ?? 0;
        station.totalTraffic = station.arrivals + station.departures;
        return station;
    });
}

// Function to convert Date to minutes since midnight
function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
}

// Function to filter trips by selected time
function filterTripsByTime(trips, timeFilter) {
    return timeFilter === -1
        ? trips
        : trips.filter((trip) => {
            const startedMinutes = minutesSinceMidnight(trip.started_at);
            const endedMinutes = minutesSinceMidnight(trip.ended_at);
            return (
                Math.abs(startedMinutes - timeFilter) <= 60 ||
                Math.abs(endedMinutes - timeFilter) <= 60
            );
        });
}

// Map loading event
map.on('load', () => {
    // Add bike lane layers
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

    // Fetch data and initialize visualization
    Promise.all([
        d3.json(stationUrl),
        d3.csv(trafficUrl, (trip) => {
            trip.started_at = new Date(trip.started_at);
            trip.ended_at = new Date(trip.ended_at);
            return trip;
        })
    ]).then(([stationData, trafficData]) => {
        let stations = computeStationTraffic(stationData.data.stations, trafficData);

        // Define a square root scale for circle size
        const radiusScale = d3.scaleSqrt()
            .domain([0, d3.max(stations, d => d.totalTraffic)])
            .range([0, 25]);

        // Overlay an SVG layer on the map
        const svg = d3.select('#map').append('svg')
            .style('position', 'absolute')
            .style('z-index', 1)
            .style('width', '100%')
            .style('height', '100%')
            .style('pointer-events', 'none');

        // Append circles to the SVG for each station
        circles = svg.selectAll('circle')
            .data(stations, d => d.short_name)
            .enter()
            .append('circle')
            .attr('fill', 'steelblue')
            .attr('stroke', 'white')
            .attr('stroke-width', 1)
            .attr('fill-opacity', 0.6)
            .attr('r', d => radiusScale(d.totalTraffic));

        // Add tooltips to circles
        circles.each(function(d) {
            d3.select(this)
                .append('title')
                .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
        });

        // Function to update scatter plot based on time filter
        function updateScatterPlot(timeFilter) {
            const filteredTrips = filterTripsByTime(trafficData, timeFilter);
            const filteredStations = computeStationTraffic(stationData.data.stations, filteredTrips);

            timeFilter === -1 ? radiusScale.range([0, 25]) : radiusScale.range([3, 50]);

            circles
                .data(filteredStations, d => d.short_name)
                .join('circle')
                .attr('r', d => radiusScale(d.totalTraffic));
        }

        // Function to convert station coordinates to pixel coordinates
        function getCoords(station) {
            const point = new mapboxgl.LngLat(+station.lon, +station.lat);
            const { x, y } = map.project(point);
            return { cx: x, cy: y };
        }

        // Function to update circle positions when the map moves/zooms
        function updatePositions() {
            circles
                .attr('cx', d => getCoords(d).cx)
                .attr('cy', d => getCoords(d).cy);
        }

        // Initial position update when map loads
        updatePositions();

        // Reposition markers on map interactions
        map.on('move', updatePositions);
        map.on('zoom', updatePositions);
        map.on('resize', updatePositions);
        map.on('moveend', updatePositions);

        // Step 5.2: Reactivity - Adding Slider Functionality
        const timeSlider = document.getElementById("time-slider");
        const selectedTime = document.getElementById("selected-time");
        const anyTimeLabel = document.getElementById("any-time");

        // Helper function to format time
        function formatTime(minutes) {
            const date = new Date(0, 0, 0, 0, minutes);
            return date.toLocaleTimeString("en-US", { timeStyle: "short" });
        }

        // Function to update time display based on slider value
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

        // Bind slider input event to function
        timeSlider.addEventListener("input", updateTimeDisplay);
        updateTimeDisplay();
    }).catch(error => {
        console.error('Error loading JSON or CSV:', error);
    });
});
