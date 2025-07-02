const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Job title is required"],
      trim: true,
      maxlength: [100, "Job title cannot exceed 100 characters"],
    },
    company: {
      type: String,
      required: [true, "Company name is required"],
      trim: true,
      maxlength: [100, "Company name cannot exceed 100 characters"],
    },
    description: {
      type: String,
      required: [true, "Job description is required"],
      maxlength: [5000, "Description cannot exceed 5000 characters"],
    },
    requirements: {
      type: String,
      maxlength: [3000, "Requirements cannot exceed 3000 characters"],
    },
    location: {
      type: String,
      required: [true, "Location is required"],
      trim: true,
    },
    type: {
      type: String,
      required: [true, "Job type is required"],
      enum: ["full-time", "part-time", "contract", "internship", "remote"],
    },
    category: {
      type: String,
      required: [true, "Job category is required"],
      enum: [
        "technology",
        "marketing",
        "design",
        "sales",
        "finance",
        "healthcare",
        "education",
        "engineering",
        "operations",
        "customer-service",
        "other",
      ],
    },
    salary: {
      min: {
        type: Number,
        min: [0, "Minimum salary cannot be negative"],
      },
      max: {
        type: Number,
        min: [0, "Maximum salary cannot be negative"],
      },
      currency: {
        type: String,
        default: "USD",
      },
      period: {
        type: String,
        enum: ["hourly", "monthly", "yearly"],
        default: "yearly",
      },
    },
    tags: [
      {
        type: String,
        trim: true,
        lowercase: true,
      },
    ],
    logo: {
      type: String,
      default: "",
    },
    experienceLevel: {
      type: String,
      enum: ["entry", "mid", "senior", "lead", "executive"],
      default: "mid",
    },
    benefits: [String],
    applicationDeadline: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    featured: {
      type: Boolean,
      default: false,
    },
    applicationsCount: {
      type: Number,
      default: 0,
    },
    viewsCount: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better query performance
jobSchema.index({
  title: "text",
  company: "text",
  description: "text",
  tags: "text",
});
jobSchema.index({ location: 1 });
jobSchema.index({ type: 1 });
jobSchema.index({ category: 1 });
jobSchema.index({ "salary.min": 1, "salary.max": 1 });
jobSchema.index({ createdAt: -1 });
jobSchema.index({ isActive: 1 });
jobSchema.index({ featured: 1 });

// Validate salary range
jobSchema.pre("save", function (next) {
  if (this.salary.min && this.salary.max && this.salary.min > this.salary.max) {
    const error = new Error(
      "Minimum salary cannot be greater than maximum salary"
    );
    return next(error);
  }
  next();
});

const Job = mongoose.model("Job", jobSchema);

module.exports = Job;
