// Initialize map without setting view yet
var map = L.map('map');

// Add tile layer
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Custom icons
var batteryIcon = L.icon({
    iconUrl: './assets/evcar.png',
    iconSize: [60, 60]
});

var csvIcon = L.icon({
    iconUrl: './assets/charging_station.png',
    iconSize: [50, 50]
});

// Distance calculator (Haversine Formula)
function getDistance(lat1, lon1, lat2, lon2) {
    function toRad(x) {
        return x * Math.PI / 180;
    }

    const R = 6371; // Radius of Earth in km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Constants
const ENERGY_PER_KM = 0.15; // in kWh/km
const AVERAGE_SPEED_KMPH = 40; // average EV speed in km/h

let userLatLng = [28.6109, 77.0385]; // Fallback location
let evMarker = L.marker(userLatLng, { icon: batteryIcon }).addTo(map);
const nearbyStores = [];

// Get user's location
navigator.geolocation.getCurrentPosition((pos) => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    userLatLng = [lat, lng];

    map.setView(userLatLng, 13);
    evMarker.setLatLng(userLatLng)
        .bindPopup(`<b style="color: green; font-size: 16px;">You are here</b>`, {
            closeButton: false,
            offset: L.point(0, -12)
        }).openPopup();

    storeList.forEach((shop) => {
        const shopLat = shop.geometry.coordinates[1];
        const shopLng = shop.geometry.coordinates[0];
        const distance = getDistance(lat, lng, shopLat, shopLng);

        if (distance <= 5) {
            shop.properties.distance = parseFloat(distance.toFixed(2));
            shop.properties.energy = parseFloat((ENERGY_PER_KM * shop.properties.distance).toFixed(2));
            shop.properties.eta = Math.ceil((shop.properties.distance / AVERAGE_SPEED_KMPH) * 60); // in minutes
            nearbyStores.push(shop);
        }
    });

    generateList();
    renderNearbyMarkers();

}, (err) => {
    alert("Location access denied. Cannot filter nearby EV stations.");
    map.setView(userLatLng, 13);

    storeList.forEach((shop) => {
        const shopLat = shop.geometry.coordinates[1];
        const shopLng = shop.geometry.coordinates[0];
        const distance = getDistance(userLatLng[0], userLatLng[1], shopLat, shopLng);

        if (distance <= 5) {
            shop.properties.distance = parseFloat(distance.toFixed(2));
            shop.properties.energy = parseFloat((ENERGY_PER_KM * shop.properties.distance).toFixed(2));
            shop.properties.eta = Math.ceil((shop.properties.distance / AVERAGE_SPEED_KMPH) * 60); // in minutes
            nearbyStores.push(shop);
        }
    });

    generateList();
    renderNearbyMarkers();
});

// Generate sidebar
function generateList() {
    const ul = document.querySelector('.list');
    ul.innerHTML = "";

    // Sort by distance
    nearbyStores.sort((a, b) => a.properties.distance - b.properties.distance);

    nearbyStores.forEach((shop) => {
        const li = document.createElement('li');
        const div = document.createElement('div');
        const a = document.createElement('a');
        const p = document.createElement('p');
        const e = document.createElement('p');

        a.addEventListener('click', () => flytoStore(shop));

        div.classList.add('shop-item');
        a.innerText = `${shop.properties.name} (${shop.properties.distance} km)`;
        a.href = '#';
        p.innerText = shop.properties.address;
        e.innerHTML = `<span style="font-size: 13px; color: #555;">⚡ Estimated Energy: <strong>${shop.properties.energy} kWh</strong></span>`;

        div.appendChild(a);
        div.appendChild(p);
        div.appendChild(e);

        if (shop.properties.eta) {
            const t = document.createElement('p');
            t.innerHTML = `<span style="font-size: 13px; color: #555;">🕒 Estimated Time: <strong>${shop.properties.eta} min</strong></span>`;
            div.appendChild(t); // Append Estimated Time below Energy
        }

        li.appendChild(div);
        ul.appendChild(li);
    });
}

// Render markers
function renderNearbyMarkers() {
    const markerCluster = L.markerClusterGroup();

    const shopsLayer = L.geoJSON(nearbyStores, {
        onEachFeature: onEachFeature,
        pointToLayer: function (feature, latlng) {
            return L.marker(latlng, { icon: csvIcon });
        }
    });

    markerCluster.addLayer(shopsLayer);
    map.addLayer(markerCluster);
}

function makePopupContent(shop) {
    return `
        <div>
            <h4>${shop.properties.name}</h4>
            <p>${shop.properties.address}</p>
            <p><strong>Distance:</strong> ${shop.properties.distance} km</p>
            <p><strong>Est. Energy:</strong> ${shop.properties.energy} kWh</p>
            <p><strong>Est. Time:</strong> ${shop.properties.eta} min</p>
        </div>
    `;
}

function onEachFeature(feature, layer) {
    layer.bindPopup(makePopupContent(feature), { offset: L.point(0, -8) });
}

function flytoStore(store) {
    const lat = store.geometry.coordinates[1];
    const lng = store.geometry.coordinates[0];

    map.flyTo([lat, lng], 14, { duration: 1 });

    setTimeout(() => {
        L.popup({ offset: L.point(0, -8) })
            .setLatLng([lat, lng])
            .setContent(makePopupContent(store))
            .openOn(map);
    }, 1000);

    // Animate EV marker
    L.Routing.control({
        waypoints: [
            L.latLng(userLatLng[0], userLatLng[1]),
            L.latLng(lat, lng)
        ],
        createMarker: () => null,
        addWaypoints: false,
        routeWhileDragging: false,
        draggableWaypoints: false
    }).on('routesfound', function (e) {
        const route = e.routes[0].coordinates;
        route.forEach((coord, index) => {
            setTimeout(() => {
                evMarker.setLatLng([coord.lat, coord.lng]);
            }, 250 * index);
        });
    }).addTo(map);
}
