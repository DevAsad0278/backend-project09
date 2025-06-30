const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const JWT_SECRET = "your_jwt_secret_key"; // 🟢 Change this to a strong secret

// Register route
router.post("/register", async (req, res) => {
  const { name, email, password, userType } = req.body;

  try {
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ msg: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    user = new User({
      name,
      email,
      password: hashedPassword,
      userType,
    });

    await user.save();

    const payload = {
      user: {
        id: user.id,
        email: user.email,
        userType: user.userType,
      },
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });

    res.json({
      token,
      user: payload.user,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

// Login route
router.post("/login", async (req, res) => {
  const { email, password, userType } = req.body;

  try {
    const user = await User.findOne({ email, userType });

    if (!user) {
      return res.status(400).json({ msg: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ msg: "Invalid credentials" });
    }

    const payload = {
      user: {
        id: user.id,
        email: user.email,
        userType: user.userType,
      },
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });

    res.json({
      token,
      user: payload.user,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server error");
  }
});

module.exports = router;
