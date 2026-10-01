import { useNavigate } from "react-router-dom";
import "./Welcome.css";
import bgImage from "./GLS-University-Law-Garden-Ahmedabad.png";

export default function Welcome() {
  const navigate = useNavigate();

  const openStaffLogin = () => {
    navigate("/staff/login");
  };

  return (
    <div
      className="welcome-bg"
      style={{
        backgroundImage: `url(${bgImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        height: "100vh",
      }}
    >
      <div className="overlay"></div>

      <div className="welcome-card">
        <h1>🎓 CampusCore</h1>

        <p className="subtitle">
          Smart Campus Management System
        </p>

        <h2>Select Your Role</h2>

        <div className="btn-group">
          <button className="btn admin" onClick={() => navigate("/login/admin")}>
            👨‍💼 Admin
          </button>

          <button className="btn teacher" onClick={() => navigate("/login/teacher")}>
            👨‍🏫 Teacher
          </button>

          <button className="btn student" onClick={() => navigate("/login/student")}>
            🎓 Student
          </button>

          <button
            className="btn"
            onClick={openStaffLogin}
            style={{ backgroundColor: "#f97316", color: "#ffffff" }}
          >
            🛠️ Helpdesk Staff
          </button>
        </div>
      </div>
    </div>
  );
}
