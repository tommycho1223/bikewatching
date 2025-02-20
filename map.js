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
    const jsonUrl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
    d3.json(jsonUrl).then(jsonData => {
        console.log('Loaded JSON Data:', jsonData); // Log to verify structure
        const stations = jsonData.data.stations;
        console.log('Stations Array:', stations);
    }).catch(error => {
        console.error('Error loading JSON:', error); // Handle errors
    });
});
