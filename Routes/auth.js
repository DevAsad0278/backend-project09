const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const { body, validationResult } = require("express-validator");
const User = require("../models/User");

// ===================== Register route =====================
router.post(
  "/register",
  [
    body("name").notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
    body("userType").notEmpty().withMessage("User type is required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json({ msg: "Validation failed", errors: errors.array() });
      }

      const {
        name,
        email,
        password,
        userType,
        dateOfBirth,
        location,
        education,
        degree,
        fieldOfStudy,
        university,
        graduationYear,
        gpa,
        experience,
        currentJobTitle,
        currentCompany,
        skills,
        jobType,
        workType,
        preferredLocation,
        salaryRange,
        industries,
      } = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ msg: "User already exists" });
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Create new user
      const newUser = new User({
        name,
        email,
        password: hashedPassword,
        userType,
        dateOfBirth,
        location,
        education,
        degree,
        fieldOfStudy,
        university,
        graduationYear,
        gpa,
        experience,
        currentJobTitle,
        currentCompany,
        skills,
        jobType,
        workType,
        preferredLocation,
        salaryRange,
        industries,
        applications: [],
      });

      await newUser.save();

      const userToReturn = newUser.toObject();
      delete userToReturn.password;

      res
        .status(201)
        .json({ msg: "User registered successfully", user: userToReturn });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ msg: "Server error" });
    }
  }
);

// ===================== Apply Job route =====================
router.post(
  "/apply-job",
  [
    body("userId").notEmpty().withMessage("User ID is required"),
    body("jobId").notEmpty().withMessage("Job ID is required"),
    body("jobTitle").notEmpty().withMessage("Job title is required"),
    body("company").notEmpty().withMessage("Company is required"),
    body("resume").notEmpty().withMessage("Resume link or file is required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res
          .status(400)
          .json({ msg: "Validation failed", errors: errors.array() });
      }

      const {
        userId,
        jobId,
        jobTitle,
        company,
        location,
        salary,
        personalInfo,
        resume,
        coverLetter,
      } = req.body;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ msg: "User not found" });
      }

      // Check if user has already applied to this job
      const alreadyApplied = user.applications.some(
        (app) => app.jobId === jobId
      );
      if (alreadyApplied) {
        return res
          .status(400)
          .json({ msg: "You have already applied to this job" });
      }

      // Create new application object
      const newApplication = {
        jobId,
        jobTitle,
        company,
        location,
        salary,
        personalInfo,
        resume,
        coverLetter,
        appliedAt: new Date(),
      };

      // Push to user's applications array
      user.applications.push(newApplication);
      await user.save();

      res.status(200).json({
        msg: "Application submitted successfully",
        application: newApplication,
      });
    } catch (error) {
      console.error("Apply job error:", error);
      res.status(500).json({ msg: "Server error" });
    }
  }
);

module.exports = router;
