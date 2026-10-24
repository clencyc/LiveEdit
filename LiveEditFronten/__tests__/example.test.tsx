/**
 * LiveEdit Frontend — Test Suite
 * Stack: Vitest + React Testing Library
 *
 * Tests real production components and service logic:
 * - SubscriptionGate (feature gating, fallback messaging, upgrade triggers)
 * - AuthForm (Logto authentication options, callbacks, loading and error states)
 * - ProductHuntLaunchTimer (launch timer and call-to-action links)
 * - apiFetch & requireBackendUrl (auth token header injection, URL resolution)
 * - chatWithBackend (real API request dispatching and error handling)
 */

import React from "react";
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

// Real components under test
import { SubscriptionGate } from "../components/SubscriptionGate";
import AuthForm from "../components/AuthForm";
import ProductHuntLaunchTimer from "../components/ProductHuntLaunchTimer";

// Real services under test
import { apiFetch, requireBackendUrl, setAuthTokenGetter, BACKEND_URL } from "../services/api";
import { chatWithBackend } from "../services/gemini";

// ─────────────────────────────────────────────
// MOCKS for external libraries / browser APIs
// ─────────────────────────────────────────────

// Mock Logto SDK hook for AuthForm tests
const mockSignIn = vi.fn();
let mockError: { message?: string } | null = null;
let mockIsLoading = false;

vi.mock("@logto/react", () => ({
  useLogto: () => ({
    signIn: mockSignIn,
    error: mockError,
    isLoading: mockIsLoading,
  }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mockError = null;
  mockIsLoading = false;
  mockSignIn.mockReset();
  setAuthTokenGetter(async () => null);
});

// ─────────────────────────────────────────────
// 1. SubscriptionGate COMPONENT TESTS
// ─────────────────────────────────────────────

describe("SubscriptionGate component", () => {
  test("renders children directly when user has access", () => {
    render(
      <SubscriptionGate
        requiredFeature="1080p_export"
        hasAccess={true}
        onUpgrade={vi.fn()}
      >
        <div data-testid="protected-content">1080p Export Video</div>
      </SubscriptionGate>
    );

    expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    expect(screen.queryByText("Premium Feature")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /upgrade now/i })).not.toBeInTheDocument();
  });

  test("renders feature upgrade overlay when user lacks access", () => {
    render(
      <SubscriptionGate
        requiredFeature="1080p_export"
        hasAccess={false}
        onUpgrade={vi.fn()}
      >
        <div data-testid="protected-content">1080p Export Video</div>
      </SubscriptionGate>
    );

    expect(screen.getByText("Premium Feature")).toBeInTheDocument();
    expect(screen.getByText("Export videos in 1080p HD quality")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /upgrade now/i })).toBeInTheDocument();
  });

  test("renders specific messaging for different required features", () => {
    const { rerender } = render(
      <SubscriptionGate
        requiredFeature="4k_export"
        hasAccess={false}
        onUpgrade={vi.fn()}
      >
        <span>Content</span>
      </SubscriptionGate>
    );
    expect(screen.getByText("Export videos in stunning 4K resolution")).toBeInTheDocument();

    rerender(
      <SubscriptionGate
        requiredFeature="priority_support"
        hasAccess={false}
        onUpgrade={vi.fn()}
      >
        <span>Content</span>
      </SubscriptionGate>
    );
    expect(screen.getByText("Get priority support from our team")).toBeInTheDocument();

    rerender(
      <SubscriptionGate
        requiredFeature="api_access"
        hasAccess={false}
        onUpgrade={vi.fn()}
      >
        <span>Content</span>
      </SubscriptionGate>
    );
    expect(screen.getByText("Access our powerful API")).toBeInTheDocument();
  });

  test("renders fallbackMessage for unrecognised feature", () => {
    render(
      <SubscriptionGate
        requiredFeature="custom_unknown_feature"
        fallbackMessage="Unlock custom workflows with our Studio plan"
        hasAccess={false}
        onUpgrade={vi.fn()}
      >
        <span>Content</span>
      </SubscriptionGate>
    );

    expect(
      screen.getByText("Unlock custom workflows with our Studio plan")
    ).toBeInTheDocument();
  });

  test("triggers onUpgrade callback when Upgrade Now is clicked", async () => {
    const handleUpgrade = vi.fn();
    const user = userEvent.setup();

    render(
      <SubscriptionGate
        requiredFeature="4k_export"
        hasAccess={false}
        onUpgrade={handleUpgrade}
      >
        <span>4K Project</span>
      </SubscriptionGate>
    );

    const upgradeButton = screen.getByRole("button", { name: /upgrade now/i });
    await user.click(upgradeButton);

    expect(handleUpgrade).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────
// 2. AuthForm COMPONENT TESTS
// ─────────────────────────────────────────────

describe("AuthForm component", () => {
  test("renders sign-in heading, social button, and email button", () => {
    render(<AuthForm onClose={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: /sign in or create an account/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /continue with google/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /continue with email/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /forgot your password\?/i })
    ).toBeInTheDocument();
  });

  test("calls onClose when Back button is clicked", async () => {
    const handleClose = vi.fn();
    const user = userEvent.setup();

    render(<AuthForm onClose={handleClose} />);

    await user.click(screen.getByRole("button", { name: /back/i }));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  test("initiates Google social sign-in on button click", async () => {
    const user = userEvent.setup();

    render(<AuthForm onClose={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /continue with google/i }));
    expect(mockSignIn).toHaveBeenCalledWith(
      expect.objectContaining({
        directSignIn: { method: "social", target: "google" },
      })
    );
  });

  test("initiates email sign-in on button click", async () => {
    const user = userEvent.setup();

    render(<AuthForm onClose={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /continue with email/i }));
    expect(mockSignIn).toHaveBeenCalledWith(
      expect.objectContaining({
        firstScreen: "signIn",
      })
    );
  });

  test("displays error alert when auth error exists", () => {
    mockError = { message: "Invalid credentials. Please try again." };

    render(<AuthForm onClose={vi.fn()} />);

    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent("Invalid credentials. Please try again.");
  });

  test("disables buttons and shows connecting state when isLoading is true", () => {
    mockIsLoading = true;

    render(<AuthForm onClose={vi.fn()} />);

    const googleBtn = screen.getByRole("button", { name: /connecting…/i });
    expect(googleBtn).toBeDisabled();
    expect(screen.getByRole("button", { name: /continue with email/i })).toBeDisabled();
  });
});

// ─────────────────────────────────────────────
// 3. ProductHuntLaunchTimer COMPONENT TESTS
// ─────────────────────────────────────────────

describe("ProductHuntLaunchTimer component", () => {
  test("renders countdown timer labels and links", () => {
    render(<ProductHuntLaunchTimer />);

    // Renders either countdown labels (Days, Hours, Minutes, Seconds) or live banner
    const phLinks = screen.getAllByRole("link");
    expect(phLinks.length).toBeGreaterThan(0);
    expect(phLinks.some((a) => (a as HTMLAnchorElement).href.includes("producthunt.com"))).toBe(true);
  });
});

// ─────────────────────────────────────────────
// 4. API SERVICE TESTS (api.ts)
// ─────────────────────────────────────────────

describe("API service — services/api.ts", () => {
  beforeEach(() => {
    setAuthTokenGetter(async () => null);
  });

  test("requireBackendUrl returns the configured BACKEND_URL", () => {
    const url = requireBackendUrl();
    expect(typeof url).toBe("string");
    expect(url).toBe(BACKEND_URL);
  });

  test("apiFetch dispatches fetch request with provided options", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "ok" }), { status: 200 })
    );

    const response = await apiFetch("/api/health", { method: "GET" });
    expect(fetchSpy).toHaveBeenCalledWith("/api/health", expect.objectContaining({ method: "GET" }));
    expect(response.status).toBe(200);
  });

  test("apiFetch attaches Bearer token header when auth token is available", async () => {
    setAuthTokenGetter(async () => "test-jwt-token-xyz");

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), { status: 200 })
    );

    await apiFetch("/api/protected-resource");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer test-jwt-token-xyz");
  });

  test("apiFetch does not attach Authorization header when auth token is null", async () => {
    setAuthTokenGetter(async () => null);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), { status: 200 })
    );

    await apiFetch("/api/public-resource");

    const [, init] = fetchSpy.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBeNull();
  });
});

// ─────────────────────────────────────────────
// 5. GEMINI SERVICE TESTS (services/gemini.ts)
// ─────────────────────────────────────────────

describe("chatWithBackend service — services/gemini.ts", () => {
  test("sends message payload and returns response text on success", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ message: "AI response: Video cut completed." }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const result = await chatWithBackend("Trim first 3 seconds");

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/chat"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ message: "Trim first 3 seconds" }),
      })
    );
    expect(result).toBe("AI response: Video cut completed.");
  });

  test("throws descriptive error when backend returns non-ok status", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Server Error", {
        status: 500,
        statusText: "Internal Server Error",
      })
    );

    await expect(chatWithBackend("Hello")).rejects.toThrow(
      "Backend error: Internal Server Error"
    );
  });
});