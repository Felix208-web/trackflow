
import { useEffect, useRef, useState } from "react";
import "./App.css";
import { apiRequest } from "./lib/api";
import Dashboard from "./Dashboard";
import ProjectWorkspace from "./ProjectWorkspace";

type VerificationResponse = {
  success?: boolean;
  emailSent?: boolean;
  message: string;
};

function App() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [showVerificationNotice, setShowVerificationNotice] =
    useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [verificationNotice, setVerificationNotice] = useState("");

  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [resendError, setResendError] = useState("");

  const [verificationStatus, setVerificationStatus] = useState<
    "loading" | "success" | "error"
  >("loading");
  const [verificationResult, setVerificationResult] = useState("");

  const verificationStarted = useRef(false);
  const path = window.location.pathname;

  useEffect(() => {
    if (path !== "/verify-email") return;
    if (verificationStarted.current) return;

    verificationStarted.current = true;

    const token = new URLSearchParams(window.location.search).get("token");

    if (!token) {
      setVerificationStatus("error");
      setVerificationResult(
        "This verification link is missing its token. Request a new verification email.",
      );
      return;
    }

    apiRequest<VerificationResponse>("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    })
      .then((result) => {
        setVerificationStatus("success");
        setVerificationResult(
          result.message || "Your email has been verified. You can now sign in.",
        );
      })
      .catch((err: unknown) => {
        setVerificationStatus("error");
        setVerificationResult(
          err instanceof Error
            ? err.message
            : "Verification failed. Please try again.",
        );
      });
  }, [path]);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setLoading(true);
    setError("");
    setResendMessage("");
    setResendError("");

    try {
      if (isRegistering) {
        const result = await apiRequest<VerificationResponse>(
          "/auth/register",
          {
            method: "POST",
            body: JSON.stringify({
              name: name.trim(),
              email: email.trim(),
              password,
            }),
          },
        );

        setVerificationEmail(email.trim());
        setVerificationNotice(result.message);
        setShowVerificationNotice(true);
        setPassword("");
        return;
      }

      await apiRequest("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      window.location.href = "/dashboard";
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleResendVerification() {
    const targetEmail = (
      verificationEmail || email
    ).trim();

    setResendMessage("");
    setResendError("");

    if (!targetEmail) {
      setResendError("Enter your email address first.");
      return;
    }

    setResendLoading(true);

    try {
      const result = await apiRequest<VerificationResponse>(
        "/auth/resend-verification",
        {
          method: "POST",
          body: JSON.stringify({ email: targetEmail }),
        },
      );

      setResendMessage(result.message);
    } catch (err: unknown) {
      setResendError(
        err instanceof Error
          ? err.message
          : "Unable to request a new email. Please try again.",
      );
    } finally {
      setResendLoading(false);
    }
  }

  if (path === "/verify-email") {
    return (
      <main className="verification-page">
        <section className="verification-card">
          <a className="brand" href="/">
            <span className="brand-icon">T</span>
            <span>TrackFlow</span>
          </a>

          {verificationStatus === "loading" && (
            <>
              <div className="verification-symbol" aria-hidden="true">
                ...
              </div>
              <h1>Verifying your email</h1>
              <p>Please wait while we confirm your email address.</p>
            </>
          )}

          {verificationStatus === "success" && (
            <>
              <div
                className="verification-symbol verification-success"
                aria-hidden="true"
              >
                ✓
              </div>
              <h1>Email verified!</h1>
              <p>{verificationResult}</p>
              <a className="verification-link" href="/">
                Continue to sign in
              </a>
            </>
          )}

          {verificationStatus === "error" && (
            <>
              <div
                className="verification-symbol verification-failure"
                aria-hidden="true"
              >
                !
              </div>
              <h1>Verification unsuccessful</h1>
              <p role="alert">{verificationResult}</p>

              <button
                type="button"
                onClick={() => {
                  window.location.href = "/";
                }}
              >
                Return to sign in
              </button>

              <p className="verification-help">
                You can request another verification email from the sign-in
                page.
              </p>
            </>
          )}
        </section>
      </main>
    );
  }

  if (path === "/dashboard") {
    return <Dashboard />;
  }

  if (path.startsWith("/projects/")) {
    return <ProjectWorkspace />;
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <a className="brand" href="/">
          <span className="brand-icon">T</span>
          <span>TrackFlow</span>
        </a>

        {showVerificationNotice ? (
          <div className="verification-notice">
            <div
              className="verification-symbol"
              aria-hidden="true"
            >
              ✉
            </div>

            <h1>Check your email.</h1>

            <p>{verificationNotice}</p>

            <p className="verification-address">
              {verificationEmail}
            </p>

            <button
              type="button"
              onClick={handleResendVerification}
              disabled={resendLoading}
            >
              {resendLoading
                ? "Sending..."
                : "Resend verification email"}
            </button>

            {resendMessage && (
              <p className="form-message" role="status">
                {resendMessage}
              </p>
            )}

            {resendError && (
              <p className="form-error" role="alert">
                {resendError}
              </p>
            )}

            <p className="auth-switch">
              Already verified?{" "}
              <a
                href="#login"
                onClick={(event) => {
                  event.preventDefault();
                  setShowVerificationNotice(false);
                  setIsRegistering(false);
                  setError("");
                  setResendMessage("");
                  setResendError("");
                }}
              >
                Sign in
              </a>
            </p>
          </div>
        ) : (
          <>
            <div className="auth-heading">
              <p className="eyebrow">
                {isRegistering ? "GET STARTED" : "WELCOME BACK"}
              </p>

              <h1>
                {isRegistering
                  ? "Create your account."
                  : "Get things moving."}
              </h1>

              <p className="subtitle">
                {isRegistering
                  ? "Create an account to start managing projects with your team."
                  : "Sign in to pick up where your team left off."}
              </p>
            </div>

            <form className="auth-form" onSubmit={handleSubmit}>
              {isRegistering && (
                <>
                  <label htmlFor="name">Full name</label>
                  <input
                    id="name"
                    type="text"
                    placeholder="Your name"
                    autoComplete="name"
                    minLength={2}
                    maxLength={80}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                  />
                </>
              )}

              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />

              <div className="password-label">
                <label htmlFor="password">Password</label>

                {!isRegistering && (
                  <a
                    href="#forgot-password"
                    onClick={(event) => event.preventDefault()}
                  >
                    Forgot password?
                  </a>
                )}
              </div>

              <input
                id="password"
                type="password"
                placeholder={
                  isRegistering
                    ? "At least 12 characters"
                    : "Enter your password"
                }
                autoComplete={
                  isRegistering ? "new-password" : "current-password"
                }
                minLength={isRegistering ? 12 : undefined}
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />

              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}

              <button type="submit" disabled={loading}>
                {loading
                  ? isRegistering
                    ? "Creating account..."
                    : "Signing in..."
                  : isRegistering
                    ? "Create account"
                    : "Sign in"}

                {!loading && <span aria-hidden="true"> →</span>}
              </button>
            </form>

            {!isRegistering && (
              <div className="resend-verification">
                <button
                  type="button"
                  className="text-button"
                  onClick={handleResendVerification}
                  disabled={resendLoading}
                >
                  {resendLoading
                    ? "Sending verification email..."
                    : "Resend verification email"}
                </button>

                {resendMessage && (
                  <p className="form-message" role="status">
                    {resendMessage}
                  </p>
                )}

                {resendError && (
                  <p className="form-error" role="alert">
                    {resendError}
                  </p>
                )}
              </div>
            )}

            <p className="auth-switch">
              {isRegistering
                ? "Already have an account? "
                : "New to TrackFlow? "}

              <a
                href={isRegistering ? "#login" : "#register"}
                onClick={(event) => {
                  event.preventDefault();
                  setIsRegistering((current) => !current);
                  setError("");
                  setResendMessage("");
                  setResendError("");
                }}
              >
                {isRegistering ? "Sign in" : "Create an account"}
              </a>
            </p>
          </>
        )}

        <p className="auth-footer">
          Plan together. Make progress.
        </p>
      </section>

      <aside className="visual-panel">
        <div className="visual-content">
          <div className="visual-tag">
            <span className="status-dot" />
            YOUR TEAM'S WORKSPACE
          </div>

          <h2>
            Great work
            <br />
            moves forward.
          </h2>

          <p>
            Bring your tasks, projects, and people together.
            Spend less time tracking work and more time making progress.
          </p>

          <div className="preview-card">
            <div className="preview-top">
              <span>Website redesign</span>
              <span className="preview-count">3 tasks</span>
            </div>

            <div className="preview-task">
              <span className="task-check">✓</span>
              <span>Define project goals</span>
              <span className="task-status done">Done</span>
            </div>

            <div className="preview-task">
              <span className="task-check active">↗</span>
              <span>Build dashboard UI</span>
              <span className="task-status progress">
                In progress
              </span>
            </div>

            <div className="preview-task">
              <span className="task-check pending" />
              <span>Review with the team</span>
              <span className="task-status todo">To do</span>
            </div>

            <div className="progress-track">
              <div className="progress-fill" />
            </div>

            <div className="progress-caption">
              <span>Project progress</span>
              <span>33%</span>
            </div>
          </div>
        </div>

        <p className="visual-footer">
          One workspace. Everyone moving forward.
        </p>
      </aside>
    </main>
  );
}

export default App;
