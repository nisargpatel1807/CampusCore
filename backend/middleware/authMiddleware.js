const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "campuscore_secret_key_2026";
const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    if (!authHeader) return res.status(401).json({ message: "Authorization token required." });
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : authHeader.trim();
    if (!token) return res.status(401).json({ message: "Authorization token required." });
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
};
module.exports = authMiddleware;
