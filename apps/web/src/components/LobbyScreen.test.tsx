import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoGame } from "../protocol/demo";
import { LobbyScreen } from "./LobbyScreen";

afterEach(cleanup);

const lobbyState = {
  ...demoGame,
  phase: "lobby" as const,
  canStart: true,
};

describe("LobbyScreen experience polish", () => {
  it("lets only the host choose the lobby rules mode", () => {
    const dispatch = vi.fn();
    const { rerender } = render(
      <LobbyScreen state={lobbyState} connected dispatch={dispatch} />,
    );

    const picker = screen.getByRole("group", { name: "Rules mode" });
    expect(
      within(picker).getByRole("radio", { name: "Official" }),
    ).toBeChecked();
    fireEvent.click(within(picker).getByRole("radio", { name: "Võsu" }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "set-rules-mode",
      rulesMode: "vosu",
    });

    rerender(
      <LobbyScreen
        state={{
          ...lobbyState,
          selfId: "maya",
          hostId: "you",
          rulesMode: "vosu",
          players: lobbyState.players.map((player) => ({
            ...player,
            isHost: player.id === "you",
          })),
        }}
        connected
        dispatch={dispatch}
      />,
    );
    expect(
      screen.queryByRole("group", { name: "Rules mode" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Võsu", { selector: ".mode-badge" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Only the host can change this/),
    ).toBeInTheDocument();
  });

  it("confirms before the host leaves", () => {
    const dispatch = vi.fn();
    render(<LobbyScreen state={lobbyState} connected dispatch={dispatch} />);
    fireEvent.click(screen.getByRole("button", { name: "Leave table" }));
    expect(
      screen.getByRole("dialog", { name: "Leave this lobby?" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Another connected player will become host/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Leave lobby" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "leave-room" });
  });

  it("falls back when the async clipboard is unavailable", async () => {
    const originalClipboard = navigator.clipboard;
    const execCommand = vi.fn(() => true);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });
    render(<LobbyScreen state={lobbyState} connected dispatch={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy invite link" }));
    expect(await screen.findByText("Invite link copied")).toBeInTheDocument();
    expect(execCommand).toHaveBeenCalledWith("copy");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
  });

  it("opens an accessible QR invite with only the canonical room URL", () => {
    window.history.pushState(
      {},
      "",
      "/table?sessionToken=do-not-share&room=OLD#private",
    );
    const expectedUrl = new URL(
      `/?room=${lobbyState.roomCode}`,
      window.location.origin,
    ).toString();
    render(<LobbyScreen state={lobbyState} connected dispatch={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Invite players" }));

    const dialog = screen.getByRole("dialog", { name: "Invite players" });
    expect(dialog).toBeInTheDocument();
    expect(
      screen.getByTitle(`Join Grandstand room ${lobbyState.roomCode}`),
    ).toBeInTheDocument();
    expect(screen.getByTestId("invite-qr")).toHaveAttribute(
      "data-invite-url",
      expectedUrl,
    );
    expect(screen.getByRole("link", { name: expectedUrl })).toHaveAttribute(
      "href",
      expectedUrl,
    );
    expect(dialog).toHaveTextContent(`Room ${lobbyState.roomCode}`);
    expect(dialog).toHaveTextContent("Official");
    expect(dialog).toHaveTextContent("room-only");
    expect(dialog).not.toHaveTextContent("do-not-share");

    fireEvent.click(screen.getByRole("button", { name: "Close invite" }));
    expect(
      screen.queryByRole("dialog", { name: "Invite players" }),
    ).not.toBeInTheDocument();
  });

  it("copies from the Share fallback when Web Share is unavailable", async () => {
    const originalClipboard = navigator.clipboard;
    const originalShare = navigator.share;
    const execCommand = vi.fn(() => true);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });
    render(<LobbyScreen state={lobbyState} connected dispatch={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Invite players" }));
    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() => expect(execCommand).toHaveBeenCalledWith("copy"));
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: originalShare,
    });
  });
});
