const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Firebase Admin Initialization
try {
  // Try to load service account key from file
  const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
  
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: "meduhub-52922"
    });
    console.log('✅ Connected to Firebase with service account');
  } else {
    // Fallback: try environment variables
    if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: "meduhub-52922",
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        }),
        projectId: "meduhub-52922"
      });
      console.log('✅ Connected to Firebase with environment variables');
    } else {
      console.error('❌ Firebase credentials not found!');
      console.log('📝 Please download serviceAccountKey.json from Firebase Console');
      console.log('   Go to: Project Settings > Service Accounts > Generate New Private Key');
      console.log('   Save the file as serviceAccountKey.json in the project root');
      process.exit(1);
    }
  }
} catch (error) {
  console.error('❌ Firebase initialization error:', error.message);
  process.exit(1);
}

const db = admin.firestore();
const registrationsCollection = db.collection('registrations');

// Validation helper functions
const validateRegistration = (data) => {
  const errors = [];
  
  if (!data.name || data.name.trim().length < 2) {
    errors.push('Name must be at least 2 characters');
  }
  
  if (!data.phone || !/^[6-9]\d{9}$/.test(data.phone)) {
    errors.push('Please enter a valid 10-digit Indian mobile number');
  }
  
  if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push('Please enter a valid email address');
  }
  
  if (!data.state) {
    errors.push('State is required');
  }
  
  if (!data.city) {
    errors.push('City is required');
  }
  
  return errors;
};

// API Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Meduhub API is running',
    timestamp: new Date().toISOString()
  });
});

// Submit registration
app.post('/api/register', async (req, res) => {
  try {
    const { name, phone, email, state, city, inquiryType } = req.body;

    // Validation
    if (!name || !phone || !email || !state || !city) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    const validationErrors = validateRegistration(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: validationErrors.join(', ')
      });
    }

    // Check for duplicate registration (same phone or email in last 24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const phoneQuery = await registrationsCollection
      .where('phone', '==', phone.trim())
      .where('createdAt', '>=', twentyFourHoursAgo)
      .limit(1)
      .get();
    
    const emailQuery = await registrationsCollection
      .where('email', '==', email.trim().toLowerCase())
      .where('createdAt', '>=', twentyFourHoursAgo)
      .limit(1)
      .get();

    if (!phoneQuery.empty || !emailQuery.empty) {
      return res.status(409).json({
        success: false,
        message: 'You have already submitted a registration recently. Our team will contact you soon!'
      });
    }

    // Create new registration
    const registrationData = {
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim().toLowerCase(),
      state,
      city,
      inquiryType: inquiryType || 'register',
      createdAt: new Date(),
      status: 'new',
      notes: ''
    };

    const docRef = await registrationsCollection.add(registrationData);

    console.log(`📝 New ${inquiryType || 'registration'} from ${name} (${email})`);

    res.status(201).json({
      success: true,
      message: 'Registration submitted successfully!',
      data: {
        id: docRef.id,
        name: registrationData.name,
        email: registrationData.email
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      message: 'Something went wrong. Please try again later.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get all registrations (for admin)
app.get('/api/registrations', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, inquiryType } = req.query;
    
    let query = registrationsCollection.orderBy('createdAt', 'desc');
    
    if (status) {
      query = query.where('status', '==', status);
    }
    if (inquiryType) {
      query = query.where('inquiryType', '==', inquiryType);
    }

    const snapshot = await query.get();
    
    const allRegistrations = [];
    snapshot.forEach(doc => {
      allRegistrations.push({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate()
      });
    });

    const total = allRegistrations.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedRegistrations = allRegistrations.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: paginatedRegistrations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error fetching registrations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch registrations'
    });
  }
});

// Update registration status (for admin)
app.patch('/api/registrations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;

    const validStatuses = ['new', 'contacted', 'enrolled', 'closed'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      });
    }

    const docRef = registrationsCollection.doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Registration not found'
      });
    }

    const updateData = {};
    if (status) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;

    await docRef.update(updateData);

    const updatedDoc = await docRef.get();
    const updatedData = {
      id: updatedDoc.id,
      ...updatedDoc.data(),
      createdAt: updatedDoc.data().createdAt?.toDate()
    };

    res.json({
      success: true,
      data: updatedData
    });

  } catch (error) {
    console.error('Error updating registration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update registration'
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 API available at http://localhost:${PORT}/api`);
});
