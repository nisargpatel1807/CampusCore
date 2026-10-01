import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import "./Login.css";

const API = "http://localhost:5000/api";

const ROLE_CONFIG = {
  student: {
    name: "Student",
    portal: "Student Portal",
    color: "#1677ff",
    softColor: "#eaf3ff",
    icon: "🎓",
    background: "/01_CampusCore_Background_Blue.png",
    description: "Access your classes, results and campus services.",
    idLabel: "ID / Enrollment Number",
    idPlaceholder: "Enter your enrollment number",
  },
  teacher: {
    name: "Teacher",
    portal: "Teacher Portal",
    color: "#7c3aed",
    softColor: "#f3edff",
    icon: "👩‍🏫",
    background: "/02_CampusCore_Background_Purple.png",
    description: "Manage your classes, timetable and academic activities.",
    idLabel: "ID / Employee ID",
    idPlaceholder: "Enter your employee ID",
  },
  admin: {
    name: "Admin",
    portal: "Admin Portal",
    color: "#f97316",
    softColor: "#fff2e8",
    icon: "👨‍💼",
    background: "/03_CampusCore_Background_Orange.png",
    description: "Manage campus operations and system settings.",
    idLabel: "ID / Admin ID",
    idPlaceholder: "Enter your admin ID",
  },
};

export default function Login() {
  const { role } = useParams();
  const navigate = useNavigate();
  const config = ROLE_CONFIG[role] || ROLE_CONFIG.student;

  const [id_no, setId] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [showForgot, setShowForgot] = useState(false);
  const [forgotForm, setForgotForm] = useState({
    id_no: "",
    email: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [forgotLoading, setForgotLoading] = useState(false);

  useEffect(() => {
    const rememberedId =
      localStorage.getItem(`rememberedLoginId_${role}`) || "";
    setId(rememberedId);
  }, [role]);

  const handleLogin = async () => {
    const cleanId = id_no.trim();

    if (!cleanId || !password) {
      alert("Please enter your ID and password.");
      return;
    }

    try {
      setLoading(true);

      const res = await axios.post(`${API}/auth/login`, {
        id_no: cleanId,
        password,
        role,
      });

      localStorage.setItem("token", res.data.token);
      localStorage.setItem("user", JSON.stringify(res.data.user));

      if (rememberMe) {
        localStorage.setItem(`rememberedLoginId_${role}`, cleanId);
      } else {
        localStorage.removeItem(`rememberedLoginId_${role}`);
      }

      if (role === "admin") navigate("/admin/dashboard");
      else if (role === "teacher") navigate("/teacher/dashboard");
      else navigate("/student/dashboard");
    } catch (err) {
      alert(
        err.response?.data?.message ||
          "Login failed. Please check your credentials."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();

    const email = forgotForm.email.trim().toLowerCase();
    const newPassword = forgotForm.newPassword;

    if (forgotForm.id_no.trim().length < 3) {
      alert("Please enter a valid ID.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      alert("Please enter a valid email address.");
      return;
    }

    if (
      newPassword.length < 6 ||
      newPassword.length > 100 ||
      !newPassword.trim()
    ) {
      alert("New password must be 6–100 characters.");
      return;
    }

    if (newPassword !== forgotForm.confirmPassword) {
      alert("New password and confirm password do not match.");
      return;
    }

    try {
      setForgotLoading(true);

      const res = await axios.post(`${API}/auth/forgot-password`, {
        id_no: forgotForm.id_no.trim(),
        email,
        newPassword,
      });

      alert(res.data.message || "Password reset successfully.");

      setForgotForm({
        id_no: "",
        email: "",
        newPassword: "",
        confirmPassword: "",
      });

      setShowForgot(false);
    } catch (err) {
      alert(err.response?.data?.message || "Unable to reset password.");
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div
      className="login-page"
      style={{
        "--role-color": config.color,
        "--role-soft": config.softColor,
        "--role-background": `url("${config.background}")`,
      }}
    >
      <div className="login-background" />
      <div className="login-overlay" />

      <main className="login-layout">
        <section className="login-hero">
          <button
            type="button"
            className="back-role-button"
            onClick={() => navigate("/")}
          >
            <span>←</span>
            Back to role selection
          </button>

          <div className="brand-block">
            <img
              src="/CampusCore_Login_Branding_Logo.png"
              alt="CampusCore"
              className="login-logo"
            />
          </div>

          <div className="hero-content">
            <div className="portal-badge">{config.portal}</div>

            <h1>
              Welcome <span>back.</span>
            </h1>

            <p>{config.description}</p>
          </div>
        </section>

        <section className="login-card">
          <div className="login-card-header">
            <div
              className="login-icon"
              style={{
                backgroundColor: config.softColor,
                color: config.color,
              }}
            >
              {config.icon}
            </div>

            <div>
              <span
                className="secure-label"
                style={{ color: config.color }}
              >
                SECURE SIGN IN
              </span>
              <h2>{config.name} Login</h2>
            </div>
          </div>

          <p className="login-description">
            Use your CampusCore credentials to continue.
          </p>

          <div className="form-group">
            <label>{config.idLabel}</label>

            <div className="input-wrapper">
              <span
                className="input-icon"
                style={{ color: config.color }}
              >
                ID
              </span>

              <input
                value={id_no}
                onChange={(e) => setId(e.target.value)}
                placeholder={config.idPlaceholder}
                autoComplete="username"
              />
            </div>
          </div>

          <div className="form-group">
            <label>Password</label>

            <div className="input-wrapper">
              <span
                className="input-icon password-symbol"
                style={{ color: config.color }}
              >
                ••
              </span>

              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                placeholder="Enter your password"
                autoComplete="current-password"
              />

              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "◉" : "◌"}
              </button>
            </div>
          </div>

          <div className="login-options">
            <label className="remember-option">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span className="custom-checkbox" />
              <span>Remember Me</span>
            </label>

            <button
              type="button"
              className="forgot-button"
              style={{ color: config.color }}
              onClick={() => {
                setForgotForm((prev) => ({ ...prev, id_no }));
                setShowForgot(true);
              }}
            >
              Forgot Password?
            </button>
          </div>

          <button
            type="button"
            className="login-submit"
            style={{ backgroundColor: config.color }}
            onClick={handleLogin}
            disabled={loading}
          >
            <span>{loading ? "Signing in..." : "Login"}</span>
            {!loading && <span className="login-arrow">→</span>}
          </button>

          <div className="login-security-note">
            <span style={{ color: config.color }}>✓</span>
            Your login is protected by CampusCore authentication.
          </div>
        </section>
      </main>

      {showForgot && (
        <div className="forgot-overlay">
          <div className="forgot-modal">
            <div className="forgot-header">
              <div>
                <span
                  className="secure-label"
                  style={{ color: config.color }}
                >
                  ACCOUNT RECOVERY
                </span>
                <h3>Forgot Password?</h3>
                <p>
                  Reset your {config.name.toLowerCase()} account password.
                </p>
              </div>

              <button
                type="button"
                className="close-modal"
                onClick={() => setShowForgot(false)}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleForgotPassword}>
              <input
                value={forgotForm.id_no}
                onChange={(e) =>
                  setForgotForm({ ...forgotForm, id_no: e.target.value })
                }
                placeholder={config.idLabel}
                required
              />

              <input
                type="email"
                value={forgotForm.email}
                onChange={(e) =>
                  setForgotForm({ ...forgotForm, email: e.target.value })
                }
                placeholder="Registered Email"
                required
              />

              <input
                type="password"
                value={forgotForm.newPassword}
                onChange={(e) =>
                  setForgotForm({
                    ...forgotForm,
                    newPassword: e.target.value,
                  })
                }
                placeholder="New Password"
                minLength={6}
                required
              />

              <input
                type="password"
                value={forgotForm.confirmPassword}
                onChange={(e) =>
                  setForgotForm({
                    ...forgotForm,
                    confirmPassword: e.target.value,
                  })
                }
                placeholder="Confirm New Password"
                minLength={6}
                required
              />

              <button
                type="submit"
                disabled={forgotLoading}
                style={{ backgroundColor: config.color }}
              >
                {forgotLoading ? "Resetting..." : "Reset Password"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
