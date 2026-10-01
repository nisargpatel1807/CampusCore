import React, { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "./StaffLogin.css";

const API = "http://localhost:5000/api/helpdesk-staff";

export default function StaffLogin() {
  const navigate = useNavigate();

  const [staffId, setStaffId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const existingToken = sessionStorage.getItem("helpdeskStaffToken");

    if (existingToken) {
      navigate("/staff/helpdesk", { replace: true });
    }
  }, [navigate]);

  const submit = async (event) => {
    event.preventDefault();
    setError("");

    const cleanStaffId = staffId.trim().toUpperCase();

    if (!cleanStaffId) {
      setError("Please enter your Staff ID.");
      return;
    }

    if (!password) {
      setError("Please enter your password.");
      return;
    }

    try {
      setLoading(true);
      sessionStorage.removeItem("helpdeskStaffToken");

      const response = await axios.post(`${API}/login`, {
        staffId: cleanStaffId,
        password,
      });

      const token = response.data?.token;

      if (!token) {
        throw new Error("Login token was not received.");
      }

      sessionStorage.setItem("helpdeskStaffToken", token);
      navigate("/staff/helpdesk", { replace: true });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "Staff login failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="staff-login-page">
      <div
        className="staff-login-background"
        style={{
          backgroundImage:
            'url("/04_CampusCore_Background_Green.png")',
        }}
      />

      <div className="staff-login-overlay" />

      <main className="staff-login-layout">
        <section className="staff-hero">
          <button
            type="button"
            className="staff-back-button"
            onClick={() => navigate("/")}
          >
            ← Back to role selection
          </button>

          <div className="staff-brand">
            <img
              src="/CampusCore_Login_Branding_Logo.png"
              alt="CampusCore"
              className="staff-logo"
            />
          </div>

          <div className="staff-hero-content">
            <div className="staff-badge">HELPDESK PORTAL</div>

            <h1>
              Welcome <span>back.</span>
            </h1>

            <p>
              Handle student requests and campus service support from one
              secure workspace.
            </p>
          </div>
        </section>

        <section className="staff-login-card">
          <div className="staff-card-header">
            <div className="staff-icon">🎧</div>

            <div>
              <span>SECURE SIGN IN</span>
              <h2>Helpdesk Staff Login</h2>
            </div>
          </div>

          <p className="staff-description">
            Sign in with the Staff ID and password provided by Admin.
          </p>

          <form onSubmit={submit}>
            <div className="staff-form-group">
              <label>Staff ID</label>

              <div className="staff-input">
                <span>HD</span>

                <input
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value.toUpperCase())}
                  placeholder="e.g. HD001"
                  autoComplete="username"
                  maxLength={30}
                  required
                />
              </div>
            </div>

            <div className="staff-form-group">
              <label>Password</label>

              <div className="staff-input">
                <span>••</span>

                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  maxLength={100}
                  required
                />

                <button
                  type="button"
                  className="staff-password-toggle"
                  onClick={() => setShowPassword((prev) => !prev)}
                >
                  {showPassword ? "◉" : "◌"}
                </button>
              </div>
            </div>

            {error && <div className="staff-error">{error}</div>}

            <button
              type="submit"
              disabled={loading}
              className="staff-submit"
            >
              {loading ? "Signing in..." : "Login to Helpdesk"}
              {!loading && <span>→</span>}
            </button>

            <button
              type="button"
              onClick={() => navigate("/")}
              className="staff-secondary"
            >
              ← Back to CampusCore
            </button>
          </form>

          <div className="staff-security">
            <span>✓</span>
            Authorized helpdesk access only
          </div>
        </section>
      </main>
    </div>
  );
}
