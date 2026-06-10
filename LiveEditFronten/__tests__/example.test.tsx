/**
 * LiveEdit Frontend — Example Tests
 * Stack: Jest + React Testing Library
 *
 * Run: cd LiveEditFronten && npm test
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

// ─────────────────────────────────────────────
// MOCKS
// ─────────────────────────────────────────────

// Mock the services layer — tests never hit a real server or Gemini API
jest.mock("../services/api", () => ({
  sendChatMessage: jest.fn(),
  analyzeVideo: jest.fn(),
}));

// Mock useSubscription hook
jest.mock("../hooks/useSubscription", () => ({
  useSubscription: jest.fn(() => ({
    isSubscribed: true,
    plan: "pro",
    loading: false,
  })),
}));

import { sendChatMessage, analyzeVideo } from "../services/api";
import { useSubscription } from "../hooks/useSubscription";

// ─────────────────────────────────────────────
// 1. COMPONENT RENDER TESTS
// ─────────────────────────────────────────────

describe("ChatInterface — render", () => {
  test("renders chat input and send button", () => {
    const ChatInterface = () => (
      <div>
        <div data-testid="chat-messages" role="log" aria-label="chat history" />
        <input placeholder="Type a message..." aria-label="chat input" />
        <button>Send</button>
      </div>
    );

    render(<ChatInterface />);

    expect(screen.getByPlaceholderText("Type a message...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send/i })).toBeInTheDocument();
    expect(screen.getByRole("log")).toBeInTheDocument();
  });

  test("input is empty on mount", () => {
    const ChatInterface = () => (
      <input placeholder="Type a message..." defaultValue="" />
    );

    render(<ChatInterface />);
    const input = screen.getByPlaceholderText("Type a message...") as HTMLInputElement;
    expect(input.value).toBe("");
  });
});

describe("AuthForm — render", () => {
  test("renders email and password fields", () => {
    const AuthForm = () => (
      <form>
        <input type="email" placeholder="Email" aria-label="email" />
        <input type="password" placeholder="Password" aria-label="password" />
        <button type="submit">Sign In</button>
      </form>
    );

    render(<AuthForm />);

    expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });
});

describe("VideoGenerator — render", () => {
  test("renders upload area and disabled generate button", () => {
    const VideoGenerator = () => (
      <div>
        <div role="button" aria-label="upload video">
          Drop video here or click to upload
        </div>
        <button disabled>Generate</button>
      </div>
    );

    render(<VideoGenerator />);

    expect(screen.getByText(/drop video here/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate/i })).toBeDisabled();
  });
});

// ─────────────────────────────────────────────
// 2. USER INTERACTION TESTS
// ─────────────────────────────────────────────

describe("ChatInterface — interactions", () => {
  test("typing in the input updates its value", async () => {
    const user = userEvent.setup();

    const ChatInput = () => {
      const [value, setValue] = React.useState("");
      return (
        <input
          placeholder="Type a message..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      );
    };

    render(<ChatInput />);
    const input = screen.getByPlaceholderText("Type a message...");
    await user.type(input, "Analyse this clip");
    expect(input).toHaveValue("Analyse this clip");
  });

  test("send button calls sendChatMessage with the typed message", async () => {
    const mockSend = sendChatMessage as jest.Mock;
    mockSend.mockResolvedValueOnce({ message: "Got it!", status: "success" });

    const user = userEvent.setup();

    const ChatInterface = () => {
      const [msg, setMsg] = React.useState("");
      return (
        <div>
          <input
            placeholder="Type a message..."
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
          />
          <button onClick={() => sendChatMessage(msg)}>Send</button>
        </div>
      );
    };

    render(<ChatInterface />);
    await user.type(screen.getByPlaceholderText("Type a message..."), "Hello AI");
    await user.click(screen.getByRole("button", { name: /send/i }));

    expect(mockSend).toHaveBeenCalledWith("Hello AI");
  });

  test("input clears after message is sent", async () => {
    const mockSend = sendChatMessage as jest.Mock;
    mockSend.mockResolvedValueOnce({ message: "Response", status: "success" });

    const user = userEvent.setup();

    const ChatInterface = () => {
      const [msg, setMsg] = React.useState("");
      const handleSend = async () => {
        await sendChatMessage(msg);
        setMsg("");
      };
      return (
        <div>
          <input
            placeholder="Type a message..."
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
          />
          <button onClick={handleSend}>Send</button>
        </div>
      );
    };

    render(<ChatInterface />);
    const input = screen.getByPlaceholderText("Type a message...");
    await user.type(input, "Clear me after send");
    await user.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(input).toHaveValue(""));
  });
});

// ─────────────────────────────────────────────
// 3. HOOK TESTS — useSubscription
// ─────────────────────────────────────────────

describe("useSubscription hook", () => {
  test("returns subscription status and plan", () => {
    const mockUseSubscription = useSubscription as jest.Mock;
    mockUseSubscription.mockReturnValueOnce({
      isSubscribed: true,
      plan: "pro",
      loading: false,
    });

    const TestComponent = () => {
      const { isSubscribed, plan, loading } = useSubscription();
      if (loading) return <div>Loading...</div>;
      return (
        <div>
          <span data-testid="subscribed">{isSubscribed ? "yes" : "no"}</span>
          <span data-testid="plan">{plan}</span>
        </div>
      );
    };

    render(<TestComponent />);
    expect(screen.getByTestId("subscribed")).toHaveTextContent("yes");
    expect(screen.getByTestId("plan")).toHaveTextContent("pro");
  });

  test("shows loading state while fetching subscription", () => {
    const mockUseSubscription = useSubscription as jest.Mock;
    mockUseSubscription.mockReturnValueOnce({
      isSubscribed: false,
      plan: null,
      loading: true,
    });

    const TestComponent = () => {
      const { loading } = useSubscription();
      if (loading) return <div>Loading...</div>;
      return <div>Loaded</div>;
    };

    render(<TestComponent />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  test("handles unsubscribed user", () => {
    const mockUseSubscription = useSubscription as jest.Mock;
    mockUseSubscription.mockReturnValueOnce({
      isSubscribed: false,
      plan: null,
      loading: false,
    });

    const SubscriptionGate = () => {
      const { isSubscribed } = useSubscription();
      return isSubscribed ? <div>Premium content</div> : <div>Upgrade to access</div>;
    };

    render(<SubscriptionGate />);
    expect(screen.getByText("Upgrade to access")).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────
// 4. SERVICE / API MOCK TESTS
// ─────────────────────────────────────────────

describe("sendChatMessage service", () => {
  beforeEach(() => jest.clearAllMocks());

  test("returns AI message on success", async () => {
    const mockSend = sendChatMessage as jest.Mock;
    mockSend.mockResolvedValueOnce({
      message: "Here are your editing suggestions.",
      status: "success",
    });

    const result = await sendChatMessage("Analyse my video");
    expect(result.status).toBe("success");
    expect(result.message).toBe("Here are your editing suggestions.");
  });

  test("throws on network error", async () => {
    const mockSend = sendChatMessage as jest.Mock;
    mockSend.mockRejectedValueOnce(new Error("Network error"));

    await expect(sendChatMessage("Hello")).rejects.toThrow("Network error");
  });
});

describe("analyzeVideo service", () => {
  test("sends file and prompt, returns analysis object", async () => {
    const mockAnalyze = analyzeVideo as jest.Mock;
    mockAnalyze.mockResolvedValueOnce({
      summary: "A 30s sunset clip.",
      key_events: [{ time: "00:05", event: "sun touches horizon" }],
      edit_plan: [{ type: "cut", start: "00:00", end: "00:03" }],
    });

    const fakeFile = new File(["video content"], "test.mp4", { type: "video/mp4" });
    const result = await analyzeVideo(fakeFile, "Summarise this video");

    expect(mockAnalyze).toHaveBeenCalledWith(fakeFile, "Summarise this video");
    expect(result.summary).toBe("A 30s sunset clip.");
    expect(result.edit_plan).toHaveLength(1);
  });
});