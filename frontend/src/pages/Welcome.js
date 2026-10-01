import { useNavigate } from "react-router-dom";
import "./Welcome.css";

const roles = [
  {
    key: "admin",
    title: "Admin",
    subtitle: "Manage campus operations",
    icon: "👨‍💼",
    color: "#f97316",
  },
  {
    key: "teacher",
    title: "Teacher",
    subtitle: "Manage classes and academics",
    icon: "👩‍🏫",
    color: "#7c3aed",
  },
  {
    key: "student",
    title: "Student",
    subtitle: "Access your campus workspace",
    icon: "🎓",
    color: "#1677ff",
  },
  {
    key: "staff",
    title: "Helpdesk Staff",
    subtitle: "Handle campus service requests",
    icon: "🛠️",
    color: "#16a34a",
  },
];

export default function Welcome() {
  const navigate = useNavigate();

  const handleRole = (role) => {
    if (role === "staff") {
      navigate("/staff/login");
      return;
    }

    navigate(`/login/${role}`);
  };

  return (
    <div className="welcome-page">
      <div
        className="welcome-bg"
        style={{
          backgroundImage:
            'url("/01_CampusCore_Background_Blue.png")',
        }}
      />

      <div className="welcome-overlay" />

      <main className="welcome-content">
        <div className="welcome-brand">
          <img
            src="/CampusCore_Login_Branding_Logo.png"
            alt="CampusCore"
            className="welcome-logo"
          />
        </div>

        <section className="welcome-card">
          <div className="welcome-eyebrow">WELCOME TO CAMPUSCORE</div>
          <h1>Choose your workspace</h1>
          <p>Select your role to continue securely.</p>

          <div className="role-list">
            {roles.map((role) => (
              <button
                key={role.key}
                type="button"
                className="role-item"
                onClick={() => handleRole(role.key)}
                style={{ "--role-color": role.color }}
              >
                <div
                  className="role-icon"
                  style={{
                    color: role.color,
                    backgroundColor: `${role.color}12`,
                  }}
                >
                  {role.icon}
                </div>

                <div className="role-info">
                  <strong>{role.title}</strong>
                  <span>{role.subtitle}</span>
                </div>

                <div className="role-arrow">→</div>
              </button>
            ))}
          </div>

          <div className="welcome-footer">
            <span>●</span>
            Secure access • Authorized users only
          </div>
        </section>
      </main>
    </div>
  );
}
