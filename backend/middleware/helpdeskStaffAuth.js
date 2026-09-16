const jwt = require("jsonwebtoken");
const HelpdeskStaff = require("../models/HelpdeskStaff");

const JWT_SECRET = process.env.JWT_SECRET || "campuscore_secret_key_2026";

module.exports = async (req, res, next) => {
  try {
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ")) return res.status(401).json({ message: "Helpdesk staff access token is required." });
    const token = header.slice(7).trim();
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== "helpdesk_staff" || decoded.type !== "helpdesk_access" || !decoded.id) {
      return res.status(403).json({ message: "Invalid helpdesk staff access token." });
    }
    const staff = await HelpdeskStaff.findOne({ _id: decoded.id, active: true }).lean();
    if (!staff) return res.status(403).json({ message: "This helpdesk staff account is inactive or unavailable." });
    req.helpdeskStaff = staff;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Helpdesk staff access token is invalid or expired." });
  }
};
