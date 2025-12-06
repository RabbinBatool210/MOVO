// Backend API URL
const API_URL = 'https://movo-production.up.railway.app/api';

// Current user and ride data
let currentUser = null;
let currentRide = null;
let rideCheckInterval = null;
let driverLocationInterval = null;

// Map variables
let map = null;
let bookingMap = null;
let driverMap = null;
let userMarker = null;
let driverMarker = null;
let routeLine = null;

// Booking map markers
let pickupMarker = null;
let destinationMarker = null;
let settingPickup = false;
let settingDestination = false;

// GIKI Location (Ghulam Ishaq Khan Institute)
const GIKI_LOCATION = [34.071689, 72.643785];

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    showPage('signup-page');
    setupEventListeners();
}

function setupEventListeners() {
    // Auth events
    document.getElementById('signup-form').addEventListener('submit', handleSignup);
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('show-login').addEventListener('click', (e) => {
        e.preventDefault();
        showPage('login-page');
    });
    document.getElementById('show-signup').addEventListener('click', (e) => {
        e.preventDefault();
        showPage('signup-page');
    });
    
    // Navigation events
    document.getElementById('logout-btn').addEventListener('click', handleLogout);
    document.getElementById('book-ride-btn').addEventListener('click', () => {
        showPage('book-ride-page');
        initializeBookingMap();
    });
    document.getElementById('back-home-btn').addEventListener('click', () => {
        showPage('home-page');
        if (bookingMap) {
            bookingMap.remove();
            bookingMap = null;
        }
    });
    document.getElementById('confirm-booking-btn').addEventListener('click', handleBooking);
    document.getElementById('cancel-ride-btn').addEventListener('click', cancelRide);
    document.getElementById('ride-done-btn').addEventListener('click', completeRide);
    document.getElementById('continue-btn').addEventListener('click', () => showPage('login-page'));
    
    // Booking map events
    document.getElementById('set-pickup-btn').addEventListener('click', togglePickupMode);
    document.getElementById('set-destination-btn').addEventListener('click', toggleDestinationMode);
    
    // Driver events
    document.getElementById('driver-logout-btn').addEventListener('click', handleLogout);
    document.getElementById('toggle-availability').addEventListener('click', toggleDriverAvailability);
}

// Authentication Functions
async function handleSignup(e) {
    e.preventDefault();
    
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const phone = document.getElementById('signup-phone').value;
    const password = document.getElementById('signup-password').value;
    const role = document.getElementById('signup-role').value;
    
    try {
        const response = await fetch(`${API_URL}/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, phone, password, role })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentUser = data.user;
            alert('Signup successful!');
            document.getElementById('signup-form').reset();
            
            if (role === 'driver') {
                showPage('driver-page');
                initializeDriverMap();
            } else {
                document.getElementById('user-name').textContent = name;
                showPage('home-page');
            }
        } else {
            alert(data.error || 'Signup failed');
        }
    } catch (error) {
        console.error('Signup error:', error);
        alert('Network error. Please make sure the server is running.');
    }
}

async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentUser = data.user;
            alert('Login successful!');
            document.getElementById('login-form').reset();
            
            if (currentUser.role === 'driver') {
                showPage('driver-page');
                initializeDriverMap();
            } else {
                document.getElementById('user-name').textContent = currentUser.name;
                showPage('home-page');
            }
        } else {
            alert(data.error || 'Login failed');
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('Network error. Please make sure the server is running.');
    }
}

async function handleLogout() {
    // If driver, set offline
    if (currentUser && currentUser.role === 'driver') {
        try {
            await fetch(`${API_URL}/driver/offline`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ driverId: currentUser.id })
            });
        } catch (error) {
            console.error('Error setting driver offline:', error);
        }
    }
    
    currentUser = null;
    currentRide = null;
    
    if (rideCheckInterval) {
        clearInterval(rideCheckInterval);
        rideCheckInterval = null;
    }
    
    if (driverLocationInterval) {
        clearInterval(driverLocationInterval);
        driverLocationInterval = null;
    }
    
    if (bookingMap) {
        bookingMap.remove();
        bookingMap = null;
    }
    if (map) {
        map.remove();
        map = null;
    }
    if (driverMap) {
        driverMap.remove();
        driverMap = null;
    }
    
    showPage('login-page');
}

function showPage(pageId) {
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => page.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
}

// Booking Map Functions
function initializeBookingMap() {
    setTimeout(() => {
        if (bookingMap) {
            bookingMap.remove();
        }
        
        bookingMap = L.map('booking-map').setView(GIKI_LOCATION, 20);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(bookingMap);
        
        L.marker(GIKI_LOCATION, {
            icon: L.divIcon({
                className: 'custom-marker',
                html: '<div style="background: #2196F3; width: 25px; height: 25px; border-radius: 50%; border: 2px solid white;"></div>',
                iconSize: [25, 25]
            })
        }).addTo(bookingMap).bindPopup('GIKI Campus');
        
        bookingMap.on('click', onMapClick);
    }, 100);
}

function togglePickupMode() {
    settingPickup = !settingPickup;
    settingDestination = false;
    
    const pickupBtn = document.getElementById('set-pickup-btn');
    const destBtn = document.getElementById('set-destination-btn');
    
    if (settingPickup) {
        pickupBtn.classList.add('active');
        pickupBtn.textContent = 'Click on Map';
        destBtn.classList.remove('active');
        destBtn.textContent = 'Set on Map';
    } else {
        pickupBtn.classList.remove('active');
        pickupBtn.textContent = 'Set on Map';
    }
}

function toggleDestinationMode() {
    settingDestination = !settingDestination;
    settingPickup = false;
    
    const pickupBtn = document.getElementById('set-pickup-btn');
    const destBtn = document.getElementById('set-destination-btn');
    
    if (settingDestination) {
        destBtn.classList.add('active');
        destBtn.textContent = 'Click on Map';
        pickupBtn.classList.remove('active');
        pickupBtn.textContent = 'Set on Map';
    } else {
        destBtn.classList.remove('active');
        destBtn.textContent = 'Set on Map';
    }
}

function onMapClick(e) {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    
    if (settingPickup) {
        if (pickupMarker) {
            bookingMap.removeLayer(pickupMarker);
        }
        
        pickupMarker = L.marker([lat, lng], {
            icon: L.divIcon({
                className: 'custom-marker',
                html: '<div style="background: #4caf50; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">P</div>',
                iconSize: [30, 30]
            })
        }).addTo(bookingMap).bindPopup('Pickup Location');
        
        document.getElementById('pickup-location').value = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        
        settingPickup = false;
        document.getElementById('set-pickup-btn').classList.remove('active');
        document.getElementById('set-pickup-btn').textContent = 'Set on Map';
        
    } else if (settingDestination) {
        if (destinationMarker) {
            bookingMap.removeLayer(destinationMarker);
        }
        
        destinationMarker = L.marker([lat, lng], {
            icon: L.divIcon({
                className: 'custom-marker',
                html: '<div style="background: #ec407a; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold;">D</div>',
                iconSize: [30, 30]
            })
        }).addTo(bookingMap).bindPopup('Destination');
        
        document.getElementById('destination-location').value = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        
        settingDestination = false;
        document.getElementById('set-destination-btn').classList.remove('active');
        document.getElementById('set-destination-btn').textContent = 'Set on Map';
    }
    
    if (pickupMarker && destinationMarker) {
        if (routeLine && bookingMap.hasLayer(routeLine)) {
            bookingMap.removeLayer(routeLine);
        }
        
        routeLine = L.polyline([
            pickupMarker.getLatLng(),
            destinationMarker.getLatLng()
        ], {
            color: '#ec407a',
            weight: 4,
            opacity: 0.7,
            dashArray: '10, 10'
        }).addTo(bookingMap);
    }
}

// Booking Functions
async function handleBooking() {
    const pickup = document.getElementById('pickup-location').value;
    const destination = document.getElementById('destination-location').value;
    
    if (!pickup || !destination) {
        alert('Please enter both pickup and destination locations!');
        return;
    }
    
    if (!pickupMarker || !destinationMarker) {
        alert('Please set both locations on the map!');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/rides/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: currentUser.id,
                userName: currentUser.name,
                pickup: pickup,
                destination: destination,
                pickupCoords: pickupMarker.getLatLng(),
                destCoords: destinationMarker.getLatLng()
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentRide = data.ride;
            showPage('tracking-page');
            initializeTrackingMap();
            
            // Start checking for driver acceptance
            rideCheckInterval = setInterval(checkRideStatus, 2000);
        } else {
            alert('Failed to create ride request');
        }
    } catch (error) {
        console.error('Booking error:', error);
        alert('Network error. Please try again.');
    }
}

async function checkRideStatus() {
    if (!currentRide) return;
    
    try {
        const response = await fetch(`${API_URL}/rides/${currentRide.id}`);
        const data = await response.json();
        
        if (response.ok && data.ride.status === 'accepted' && currentRide.status === 'pending') {
            currentRide = data.ride;
            clearInterval(rideCheckInterval);
            rideCheckInterval = null;
            
            // Update UI with driver info
            document.getElementById('ride-status-text').textContent = 'Your Driver is on the way!';
            document.getElementById('driver-name').textContent = data.ride.driverName;
            document.getElementById('driver-details').style.display = 'block';
            document.getElementById('ride-done-btn').style.display = 'block';
            
            alert(`Driver ${data.ride.driverName} has accepted your ride!`);
            
            // Now start simulating driver movement
            updateDriverLocation();
        }
    } catch (error) {
        console.error('Error checking ride status:', error);
    }
}

async function cancelRide() {
    if (confirm('Are you sure you want to cancel this ride?')) {
        try {
            if (currentRide) {
                await fetch(`${API_URL}/rides/cancel`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rideId: currentRide.id })
                });
            }
            
            if (rideCheckInterval) {
                clearInterval(rideCheckInterval);
                rideCheckInterval = null;
            }
            
            if (driverLocationInterval) {
                clearInterval(driverLocationInterval);
                driverLocationInterval = null;
            }
            
            currentRide = null;
            pickupMarker = null;
            destinationMarker = null;
            routeLine = null;
            
            showPage('home-page');
            
            if (map) {
                map.remove();
                map = null;
            }
        } catch (error) {
            console.error('Cancel ride error:', error);
        }
    }
}

async function completeRide() {
    try {
        if (currentRide) {
            await fetch(`${API_URL}/rides/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rideId: currentRide.id })
            });
        }
        
        if (rideCheckInterval) {
            clearInterval(rideCheckInterval);
            rideCheckInterval = null;
        }
        
        if (driverLocationInterval) {
            clearInterval(driverLocationInterval);
            driverLocationInterval = null;
        }
        
        if (map) {
            map.remove();
            map = null;
        }
        
        currentRide = null;
        pickupMarker = null;
        destinationMarker = null;
        routeLine = null;
        
        showPage('complete-page');
    } catch (error) {
        console.error('Complete ride error:', error);
        alert('Error completing ride');
    }
}

// Tracking Map Functions
function initializeTrackingMap() {
    if (map) {
        map.remove();
    }
    
    if (!currentRide) return;
    
    const pickupCoords = [currentRide.pickupCoords.lat, currentRide.pickupCoords.lng];
    const destCoords = [currentRide.destCoords.lat, currentRide.destCoords.lng];
    
    map = L.map('map').setView(pickupCoords, 14);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    
    userMarker = L.marker(pickupCoords, {
        icon: L.divIcon({
            className: 'custom-marker',
            html: '<div style="background: #4caf50; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white;"></div>',
            iconSize: [30, 30]
        })
    }).addTo(map).bindPopup('Pickup Location');
    
    L.marker(destCoords, {
        icon: L.divIcon({
            className: 'custom-marker',
            html: '<div style="background: #ec407a; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white;"></div>',
            iconSize: [30, 30]
        })
    }).addTo(map).bindPopup('Destination');
    
    // Driver marker will be added only after driver accepts
    const driverLocation = [pickupCoords[0] + 0.01, pickupCoords[1] + 0.01];
    driverMarker = L.marker(driverLocation, {
        icon: L.divIcon({
            className: 'custom-marker',
            html: '<div style="background: #9c27b0; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white;"></div>',
            iconSize: [30, 30]
        })
    }).addTo(map).bindPopup('Driver Location');
    
    routeLine = L.polyline([pickupCoords, driverLocation], {
        color: '#ec407a',
        weight: 4,
        opacity: 0.7
    }).addTo(map);
    
    L.polyline([pickupCoords, destCoords], {
        color: '#2196F3',
        weight: 3,
        opacity: 0.5,
        dashArray: '10, 10'
    }).addTo(map);
    
    map.fitBounds([pickupCoords, destCoords, driverLocation]);
}

function updateDriverLocation() {
    if (!map || !driverMarker || !userMarker) return;
    
    // Only start moving driver after they accept
    driverLocationInterval = setInterval(() => {
        const currentPos = driverMarker.getLatLng();
        const userPos = userMarker.getLatLng();
        
        const newLat = currentPos.lat + (userPos.lat - currentPos.lat) * 0.1;
        const newLng = currentPos.lng + (userPos.lng - currentPos.lng) * 0.1;
        
        driverMarker.setLatLng([newLat, newLng]);
        
        if (routeLine) {
            routeLine.setLatLngs([userPos, [newLat, newLng]]);
        }
        
        const distance = Math.sqrt(
            Math.pow(newLat - userPos.lat, 2) + 
            Math.pow(newLng - userPos.lng, 2)
        );
        
        if (distance < 0.001) {
            clearInterval(driverLocationInterval);
            driverLocationInterval = null;
            alert('Driver has arrived!');
        }
    }, 1000);
}

// Driver Functions
async function initializeDriverMap() {
    setTimeout(async () => {
        if (driverMap) {
            driverMap.remove();
        }
        
        driverMap = L.map('driver-map').setView(GIKI_LOCATION, 15);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(driverMap);
        
        L.marker(GIKI_LOCATION, {
            icon: L.divIcon({
                className: 'custom-marker',
                html: '<div style="background: #ec407a; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white;"></div>',
                iconSize: [30, 30]
            })
        }).addTo(driverMap).bindPopup('Your Location (GIKI)');
        
        // Set driver online
        try {
            await fetch(`${API_URL}/driver/online`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    driverId: currentUser.id,
                    driverName: currentUser.name,
                    location: GIKI_LOCATION
                })
            });
        } catch (error) {
            console.error('Error setting driver online:', error);
        }
        
        loadPendingRides();
        setInterval(loadPendingRides, 3000);
    }, 100);
}

async function loadPendingRides() {
    try {
        const response = await fetch(`${API_URL}/rides/pending`);
        const data = await response.json();
        
        if (response.ok) {
            displayRideRequests(data.rides);
        }
    } catch (error) {
        console.error('Error loading pending rides:', error);
    }
}

function displayRideRequests(rides) {
    const requestsList = document.getElementById('requests-list');
    
    if (rides.length === 0) {
        requestsList.innerHTML = '<p class="no-requests">No ride requests at the moment</p>';
        return;
    }
    
    requestsList.innerHTML = '';
    
    rides.forEach(ride => {
        const requestDiv = document.createElement('div');
        requestDiv.className = 'request-item';
        requestDiv.innerHTML = `
            <p><strong>Passenger:</strong> ${ride.userName}</p>
            <p><strong>Pickup:</strong> ${ride.pickup}</p>
            <p><strong>Destination:</strong> ${ride.destination}</p>
            <div class="request-actions">
                <button class="accept-btn" onclick="acceptRide(${ride.id})">Accept</button>
                <button class="reject-btn" onclick="rejectRide(${ride.id})">Reject</button>
            </div>
        `;
        requestsList.appendChild(requestDiv);
    });
}

async function acceptRide(rideId) {
    try {
        const response = await fetch(`${API_URL}/rides/accept`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                rideId: rideId,
                driverId: currentUser.id,
                driverName: currentUser.name
            })
        });
        
        if (response.ok) {
            alert('Ride accepted! Navigate to pickup location.');
            loadPendingRides();
        } else {
            alert('Failed to accept ride');
        }
    } catch (error) {
        console.error('Accept ride error:', error);
        alert('Error accepting ride');
    }
}

async function rejectRide(rideId) {
    try {
        // Simply reload the list - ride stays pending for other drivers
        await loadPendingRides();
    } catch (error) {
        console.error('Reject ride error:', error);
    }
}

async function toggleDriverAvailability() {
    const statusText = document.getElementById('driver-status');
    const toggleBtn = document.getElementById('toggle-availability');
    const isOnline = statusText.textContent === 'Available';
    
    try {
        if (isOnline) {
            await fetch(`${API_URL}/driver/offline`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ driverId: currentUser.id })
            });
            
            statusText.textContent = 'Offline';
            statusText.style.color = '#f44336';
            toggleBtn.textContent = 'Go Online';
        } else {
            await fetch(`${API_URL}/driver/online`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    driverId: currentUser.id,
                    driverName: currentUser.name,
                    location: GIKI_LOCATION
                })
            });
            
            statusText.textContent = 'Available';
            statusText.style.color = '#4caf50';
            toggleBtn.textContent = 'Go Offline';
        }
    } catch (error) {
        console.error('Toggle availability error:', error);
    }
}

window.acceptRide = acceptRide;
window.rejectRide = rejectRide;