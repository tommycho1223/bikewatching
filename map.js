// Performance optimization - Precompute trip bins for quick filtering
let departuresByMinute = Array.from({ length: 1440 }, () => []);
let arrivalsByMinute = Array.from({ length: 1440 }, () => []);

// Set your Mapbox access token
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

// Function to convert a Date object to minutes since midnight
function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
}

// Define bike lane style
const bikeLaneStyle = {
    'line-color': '#32D400',
    'line-width': 3,
    'line-opacity': 0.4
};

map.on('load', () => {
    // Load Boston and Cambridge bike lane data
    map.addSource('boston_route', { type: 'geojson', data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson' });
    map.addSource('cambridge_route', { type: 'geojson', data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson' });

    map.addLayer({ id: 'bike-lanes-boston', type: 'line', source: 'boston_route', paint: bikeLaneStyle });
    map.addLayer({ id: 'bike-lanes-cambridge', type: 'line', source: 'cambridge_route', paint: bikeLaneStyle });

    const svg = d3.select('#map').append('svg')
    let stations = [];
    let circles;

    // Time filter UI elements
    const timeSlider = document.getElementById("time-slider");
    const selectedTime = document.getElementById("selected-time");
    const anyTimeLabel = document.getElementById("any-time");
    let timeFilter = -1;

    // Fetch and parse Bluebike station data using D3.js
    const jsonUrl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
    d3.json(jsonUrl).then(jsonData => {
        console.log('Loaded JSON Data:', jsonData); // Log to verify structure
        stations = jsonData.data.stations;
        console.log('Stations Array:', stations);

        const trafficUrl = 'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv';
        d3.csv(trafficUrl).then(trips => {
            console.log('Loaded Traffic Data:', trips);
            for (let trip of trips) {
                trip.started_at = new Date(trip.started_at);
                trip.ended_at = new Date(trip.ended_at);
                let startedMinutes = minutesSinceMidnight(trip.started_at);
                let endedMinutes = minutesSinceMidnight(trip.ended_at);
                departuresByMinute[startedMinutes].push(trip);
                arrivalsByMinute[endedMinutes].push(trip);
            }

            // Compute station traffic dynamically using precomputed trip bins
            const departures = d3.rollup(
                trips,
                (v) => v.length,
                (d) => d.start_station_id
            );

            const arrivals = d3.rollup(
                trips,
                (v) => v.length,
                (d) => d.end_station_id
            );
            stations = stations.map((station) => {
                let id = station.short_name;
                station.arrivals = arrivals.get(id) ?? 0;
                station.departures = departures.get(id) ?? 0;
                station.totalTraffic = station.arrivals + station.departures;
                return station;
            });
            changeCircle(stations);
        }).catch(error => {
            console.error('Error loading CSV:', error);  // Debugging
        });
    }).catch(error => {
        console.error('Error loading JSON:', error);  // Debugging
    });

    map.on('move', updatePositions);
    map.on('zoom', updatePositions);
    map.on('resize', updatePositions);
    map.on('moveend', updatePositions);

    // Function to get projected coordinates
    function getCoords(station) {
        const point = new mapboxgl.LngLat(+station.lon, +station.lat);
        const { x, y } = map.project(point);
        return { cx: x, cy: y };
    }

    // Update circle positions
    function updatePositions() {
        circles
            .attr('cx', d => getCoords(d).cx)
            .attr('cy', d => getCoords(d).cy);
    }

    // Format time for display
    function formatTime(minutes) {
        const date = new Date(0, 0, 0, 0, minutes);
        return date.toLocaleTimeString("en-US", { timeStyle: "short" });
    }

    function filterTripsbyTime(time) {
        if (time === -1) {
            return {
                filteredArrivals: arrivals,
                filteredDepartures: departures,
                filteredStations: stations
            };
        }
        const filteredDepartures = d3.rollup(
            filterByMinute(departuresByMinute, timeFilter),
            (v) => v.length,
            (d) => d.start_station_id
        );
        const filteredArrivals = d3.rollup(
            filterByMinute(arrivalsByMinute, timeFilter),
            (v) => v.length,
            (d) => d.end_station_id
        );
        const filteredStations = stations.map(station => {
            let newStation = { ...station };
            let id = newStation.short_name;

            newStation.arrivals = filteredArrivals.get(id) ?? 0;
            newStation.departures = filteredDepartures.get(id) ?? 0;
            newStation.totalTraffic = newStation.arrivals + newStation.departures;
            return newStation;
        });
        return {
            filteredArrivals,
            filteredDepartures,
            filteredStations
        };
    }

    // Efficiently retrieve relevant trips based on timeFilter
    function filterByMinute(tripBins, timeFilter) {
        let minMinute = (timeFilter - 60 + 1440) % 1440;
        let maxMinute = (timeFilter + 60) % 1440;

        if (minMinute > maxMinute) {
            let beforeMidnight = tripBins.slice(minMinute);
            let afterMidnight = tripBins.slice(0, maxMinute);
            return beforeMidnight.concat(afterMidnight).flat();
        } else {
            return tripBins.slice(minMinute, maxMinute).flat();
        }
    }

    // Update UI when slider changes
    function updateTimeDisplay() {
        timeFilter = Number(timeSlider.value);

        if (timeFilter === -1) {
            selectedTime.textContent = '';  // Clear time display
            anyTimeLabel.style.display = 'block';  // Show "(any time)"
        } else {
            selectedTime.textContent = formatTime(timeFilter);  // Display formatted time
            anyTimeLabel.style.display = 'none';  // Hide "(any time)"
        }

        // Trigger filtering logic which will be implemented in the next step
        const {
            filteredArrivals,
            filteredDepartures,
            filteredStations
        } = filterTripsbyTime(timeFilter);
        changeCircle(filteredStations);
    }

    function changeCircle(data) {
        let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

        const radiusScale = d3.scaleSqrt()
            .domain([0, d3.max(data, (d) => d.totalTraffic)])
            .range([0, 20]);

        circles = svg
            .selectAll('circle')
            .data(data, d => d.short_name)
            .join('circle')
            .attr('fill', '#3498DB')
            .attr('stroke', 'white')
            .attr('stroke-width', 1)
            .attr('opacity', 0.7)
            .attr('r', d => radiusScale(d.totalTraffic))
            .style("--departure-ratio", d => (d.totalTraffic === 0) ? 0.5 : stationFlow(d.departures / d.totalTraffic))
            .each(function (d) {
                d3.select(this)
                    .append('title')
                    .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
            });
        updatePositions();
    }

    timeSlider.addEventListener("input", updateTimeDisplay);
    updateTimeDisplay();
});
