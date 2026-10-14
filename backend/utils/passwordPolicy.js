const validatePassword = (value) => {
  const password = String(value ?? "");
  if (password.length < 8 || password.length > 100) return "Password must be 8–100 characters.";
  if (password !== password.trim()) return "Password cannot start or end with spaces.";
  if (!/[A-Z]/.test(password)) return "Password must include at least one uppercase letter.";
  if (!/[a-z]/.test(password)) return "Password must include at least one lowercase letter.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must include at least one special character.";
  return null;
};
module.exports = { validatePassword };
