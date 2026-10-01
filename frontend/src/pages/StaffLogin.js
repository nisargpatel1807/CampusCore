import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const API = "http://localhost:5000/api/helpdesk-staff";

export default function StaffLogin() {
  const navigate = useNavigate();
  const [staffId, setStaffId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const existingToken = sessionStorage.getItem("helpdeskStaffToken");
    if (existingToken) navigate("/staff/helpdesk", { replace: true });
  }, [navigate]);

  const submit = async (event) => {
    event.preventDefault();
    setError("");

    const cleanStaffId = staffId.trim().toUpperCase();
    if (!cleanStaffId) return setError("Please enter your Staff ID.");
    if (!password) return setError("Please enter your password.");

    try {
      setLoading(true);
      sessionStorage.removeItem("helpdeskStaffToken");

      const response = await axios.post(`${API}/login`, {
        staffId: cleanStaffId,
        password,
      });

      const token = response.data?.token;
      if (!token) throw new Error("Login token was not received.");

      sessionStorage.setItem("helpdeskStaffToken", token);
      navigate("/staff/helpdesk", { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Staff login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border p-7">
        <div className="text-center">
          <div className="text-4xl">🛠️</div>
          <h1 className="text-2xl font-bold text-gray-800 mt-3">Helpdesk Staff Login</h1>
          <p className="text-sm text-gray-500 mt-1">Sign in with the Staff ID and password provided by Admin.</p>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Staff ID</label>
            <input
              value={staffId}
              onChange={(e) => setStaffId(e.target.value.toUpperCase())}
              placeholder="e.g. HD001"
              autoComplete="username"
              maxLength={30}
              required
              className="w-full border border-gray-300 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-orange-300"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              maxLength={100}
              required
              className="w-full border border-gray-300 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-orange-300"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-xs p-3">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-lg py-3 text-sm font-semibold"
          >
            {loading ? "Signing in…" : "Login to Helpdesk"}
          </button>

          <button
            type="button"
            onClick={() => navigate("/")}
            className="w-full border border-gray-300 text-gray-700 rounded-lg py-3 text-sm font-semibold hover:bg-gray-50"
          >
            ← Back to CampusCore
          </button>
        </form>
      </div>
    </div>
  );
}
