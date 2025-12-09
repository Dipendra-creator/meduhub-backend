const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const MONGODB_URI = 'mongodb+srv://Meduhub:Anything_Password@cluster0.kujgquj.mongodb.net/Meduhub?appName=Cluster0';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
    console.log('⚠️ Server will continue running, but database operations will fail');
  });

// Registration Schema
const registrationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    match: [/^[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian mobile number']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    lowercase: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address']
  },
  state: {
    type: String,
    required: [true, 'State is required']
  },
  city: {
    type: String,
    required: [true, 'City is required']
  },
  inquiryType: {
    type: String,
    enum: ['register', 'inquiry'],
    default: 'register'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['new', 'contacted', 'enrolled', 'closed'],
    default: 'new'
  },
  notes: {
    type: String,
    default: ''
  }
});

// Index for faster queries
registrationSchema.index({ createdAt: -1 });
registrationSchema.index({ email: 1 });
registrationSchema.index({ phone: 1 });

const Registration = mongoose.model('Registration', registrationSchema, 'Meduhub');

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
    // Check MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: `Database connection is not ready. Please try again. {status: ${mongoose.connection}`
      });
    }

    const { name, phone, email, state, city, inquiryType } = req.body;

    // Validation
    if (!name || !phone || !email || !state || !city) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Check for duplicate registration (same phone or email in last 24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existingRegistration = await Registration.findOne({
      $or: [{ phone }, { email }],
      createdAt: { $gte: twentyFourHoursAgo }
    });

    if (existingRegistration) {
      return res.status(409).json({
        success: false,
        message: 'You have already submitted a registration recently. Our team will contact you soon!'
      });
    }

    // Create new registration
    const registration = new Registration({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim().toLowerCase(),
      state,
      city,
      inquiryType: inquiryType || 'register'
    });

    await registration.save();

    console.log(`📝 New ${inquiryType || 'registration'} from ${name} (${email})`);

    res.status(201).json({
      success: true,
      message: 'Registration submitted successfully!',
      data: {
        id: registration._id,
        name: registration.name,
        email: registration.email
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', '),
        errors: error.errors
      });
    }

    // Handle MongoDB connection errors
    if (error.name === 'MongooseError' || error.name === 'MongoError') {
      return res.status(503).json({
        success: false,
        message: 'Database connection error. Please try again later.'
      });
    }

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
    
    const query = {};
    if (status) query.status = status;
    if (inquiryType) query.inquiryType = inquiryType;

    const registrations = await Registration.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Registration.countDocuments(query);

    res.json({
      success: true,
      data: registrations,
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

    const registration = await Registration.findByIdAndUpdate(
      id,
      { status, notes },
      { new: true, runValidators: true }
    );

    if (!registration) {
      return res.status(404).json({
        success: false,
        message: 'Registration not found'
      });
    }

    res.json({
      success: true,
      data: registration
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
