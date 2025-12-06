const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();

// Middleware
app.use(cors({
    origin: '*', // Allow all origins for now - change this to your frontend URL in production
    methods: ['GET', 'POST'],
    credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

// Data file paths
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.csv');
const RIDES_FILE = path.join(DATA_DIR, 'rides.csv');

// Create data directory if it doesn't exist
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// Initialize CSV files with headers if they don't exist
function initializeCSVFiles() {
    if (!fs.existsSync(USERS_FILE)) {
        const userHeaders = 'ID,Name,Email,Phone,Password,Role,Created At\n';
        fs.writeFileSync(USERS_FILE, userHeaders);
    }
    
    if (!fs.existsSync(RIDES_FILE)) {
        const rideHeaders = 'Ride ID,User ID,User Name,Driver ID,Driver Name,Pickup Location,Destination,Pickup Lat,Pickup Lng,Dest Lat,Dest Lng,Status,Created At,Completed At\n';
        fs.writeFileSync(RIDES_FILE, rideHeaders);
    }
}

initializeCSVFiles();

// In-memory storage for active rides and drivers
let activeRides = [];
let activeDrivers = [];
let rideIdCounter = Date.now();

// Helper function to escape CSV fields
function escapeCSV(field) {
    if (field === null || field === undefined) return '';
    const str = String(field);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ 
        message: 'MOVO Backend API is running!',
        status: 'healthy',
        endpoints: {
            signup: 'POST /api/signup',
            login: 'POST /api/login',
            users: 'GET /api/users',
            rides: 'GET /api/rides'
        }
    });
});

// User Signup
app.post('/api/signup', (req, res) => {
    try {
        const { name, email, phone, password, role } = req.body;
        
        // Read existing users to check for duplicates
        const usersData = fs.readFileSync(USERS_FILE, 'utf-8');
        const users = usersData.split('\n').slice(1).filter(line => line.trim());
        
        // Check if user already exists
        const userExists = users.some(line => {
            const parts = line.split(',');
            return parts[2] === email;
        });
        
        if (userExists) {
            return res.status(400).json({ error: 'User already exists' });
        }
        
        // Create new user
        const userId = Date.now();
        const createdAt = new Date().toISOString();
        
        const userRow = `${userId},${escapeCSV(name)},${escapeCSV(email)},${escapeCSV(phone)},${escapeCSV(password)},${role},${createdAt}\n`;
        
        // Append to CSV
        fs.appendFileSync(USERS_FILE, userRow);
        
        res.json({
            success: true,
            user: {
                id: userId,
                name,
                email,
                phone,
                role,
                createdAt
            }
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Signup failed' });
    }
});

// User Login
app.post('/api/login', (req, res) => {
    try {
        const { email, password } = req.body;
        
        const usersData = fs.readFileSync(USERS_FILE, 'utf-8');
        const users = usersData.split('\n').slice(1).filter(line => line.trim());
        
        for (let line of users) {
            const parts = line.split(',');
            const userEmail = parts[2];
            const userPassword = parts[4];
            
            if (userEmail === email && userPassword === password) {
                return res.json({
                    success: true,
                    user: {
                        id: parts[0],
                        name: parts[1],
                        email: parts[2],
                        phone: parts[3],
                        role: parts[5]
                    }
                });
            }
        }
        
        res.status(401).json({ error: 'Invalid credentials' });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Get all users 
app.get('/api/users', (req, res) => {
    try {
        const usersData = fs.readFileSync(USERS_FILE, 'utf-8');
        const lines = usersData.split('\n').filter(line => line.trim());
        
        const users = lines.slice(1).map(line => {
            const parts = line.split(',');
            return {
                id: parts[0],
                name: parts[1],
                email: parts[2],
                phone: parts[3],
                role: parts[5],
                createdAt: parts[6]
            };
        });
        
        res.json({ users, total: users.length });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

// Driver goes online
app.post('/api/driver/online', (req, res) => {
    try {
        const { driverId, driverName, location } = req.body;
        
        const existingDriver = activeDrivers.find(d => d.id === driverId);
        
        if (existingDriver) {
            existingDriver.location = location;
            existingDriver.available = true;
        } else {
            activeDrivers.push({
                id: driverId,
                name: driverName,
                location,
                available: true,
                currentRide: null
            });
        }
        
        res.json({ success: true, message: 'Driver is now online' });
    } catch (error) {
        console.error('Driver online error:', error);
        res.status(500).json({ error: 'Failed to set driver online' });
    }
});

// Driver goes offline
app.post('/api/driver/offline', (req, res) => {
    try {
        const { driverId } = req.body;
        
        activeDrivers = activeDrivers.filter(d => d.id !== driverId);
        
        res.json({ success: true, message: 'Driver is now offline' });
    } catch (error) {
        console.error('Driver offline error:', error);
        res.status(500).json({ error: 'Failed to set driver offline' });
    }
});

// Create ride request
app.post('/api/rides/create', (req, res) => {
    try {
        const { userId, userName, pickup, destination, pickupCoords, destCoords } = req.body;
        
        const rideId = rideIdCounter++;
        const ride = {
            id: rideId,
            userId,
            userName,
            driverId: null,
            driverName: null,
            pickup,
            destination,
            pickupCoords,
            destCoords,
            status: 'pending',
            createdAt: new Date().toISOString(),
            completedAt: null
        };
        
        activeRides.push(ride);
        
        res.json({ success: true, ride });
    } catch (error) {
        console.error('Create ride error:', error);
        res.status(500).json({ error: 'Failed to create ride' });
    }
});

// Get pending rides (for drivers)
app.get('/api/rides/pending', (req, res) => {
    try {
        const pendingRides = activeRides.filter(r => r.status === 'pending');
        res.json({ rides: pendingRides });
    } catch (error) {
        console.error('Get pending rides error:', error);
        res.status(500).json({ error: 'Failed to get pending rides' });
    }
});

// Driver accepts ride
app.post('/api/rides/accept', (req, res) => {
    try {
        const { rideId, driverId, driverName } = req.body;
        
        const ride = activeRides.find(r => r.id === rideId);
        
        if (!ride) {
            return res.status(404).json({ error: 'Ride not found' });
        }
        
        if (ride.status !== 'pending') {
            return res.status(400).json({ error: 'Ride already accepted' });
        }
        
        ride.status = 'accepted';
        ride.driverId = driverId;
        ride.driverName = driverName;
        
        const driver = activeDrivers.find(d => d.id === driverId);
        if (driver) {
            driver.available = false;
            driver.currentRide = rideId;
        }
        
        res.json({ success: true, ride });
    } catch (error) {
        console.error('Accept ride error:', error);
        res.status(500).json({ error: 'Failed to accept ride' });
    }
});

// Get ride status (for user)
app.get('/api/rides/:rideId', (req, res) => {
    try {
        const rideId = parseInt(req.params.rideId);
        const ride = activeRides.find(r => r.id === rideId);
        
        if (!ride) {
            return res.status(404).json({ error: 'Ride not found' });
        }
        
        res.json({ ride });
    } catch (error) {
        console.error('Get ride error:', error);
        res.status(500).json({ error: 'Failed to get ride' });
    }
});

// Complete ride
app.post('/api/rides/complete', (req, res) => {
    try {
        const { rideId } = req.body;
        
        const rideIndex = activeRides.findIndex(r => r.id === rideId);
        
        if (rideIndex === -1) {
            return res.status(404).json({ error: 'Ride not found' });
        }
        
        const ride = activeRides[rideIndex];
        ride.status = 'completed';
        ride.completedAt = new Date().toISOString();
        
        // Save to CSV
        const rideRow = `${ride.id},${ride.userId},${escapeCSV(ride.userName)},${ride.driverId || ''},${escapeCSV(ride.driverName) || ''},${escapeCSV(ride.pickup)},${escapeCSV(ride.destination)},${ride.pickupCoords.lat},${ride.pickupCoords.lng},${ride.destCoords.lat},${ride.destCoords.lng},${ride.status},${ride.createdAt},${ride.completedAt}\n`;
        
        fs.appendFileSync(RIDES_FILE, rideRow);
        
        // Remove from active rides
        activeRides.splice(rideIndex, 1);
        
        // Update driver availability
        if (ride.driverId) {
            const driver = activeDrivers.find(d => d.id === ride.driverId);
            if (driver) {
                driver.available = true;
                driver.currentRide = null;
            }
        }
        
        res.json({ success: true, message: 'Ride completed' });
    } catch (error) {
        console.error('Complete ride error:', error);
        res.status(500).json({ error: 'Failed to complete ride' });
    }
});

// Cancel ride
app.post('/api/rides/cancel', (req, res) => {
    try {
        const { rideId } = req.body;
        
        const rideIndex = activeRides.findIndex(r => r.id === rideId);
        
        if (rideIndex === -1) {
            return res.status(404).json({ error: 'Ride not found' });
        }
        
        const ride = activeRides[rideIndex];
        
        if (ride.driverId) {
            const driver = activeDrivers.find(d => d.id === ride.driverId);
            if (driver) {
                driver.available = true;
                driver.currentRide = null;
            }
        }
        
        activeRides.splice(rideIndex, 1);
        
        res.json({ success: true, message: 'Ride cancelled' });
    } catch (error) {
        console.error('Cancel ride error:', error);
        res.status(500).json({ error: 'Failed to cancel ride' });
    }
});

// Get all rides (for instructor to view)
app.get('/api/rides', (req, res) => {
    try {
        const ridesData = fs.readFileSync(RIDES_FILE, 'utf-8');
        const lines = ridesData.split('\n').filter(line => line.trim());
        
        const rides = lines.slice(1).map(line => {
            const parts = line.split(',');
            return {
                rideId: parts[0],
                userId: parts[1],
                userName: parts[2],
                driverId: parts[3],
                driverName: parts[4],
                pickup: parts[5],
                destination: parts[6],
                status: parts[11],
                createdAt: parts[12],
                completedAt: parts[13]
            };
        });
        
        res.json({ rides, total: rides.length });
    } catch (error) {
        console.error('Get rides error:', error);
        res.status(500).json({ error: 'Failed to get rides' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 MOVO Backend Server running on port ${PORT}`);
    console.log(`📂 Data files stored in: ${DATA_DIR}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});