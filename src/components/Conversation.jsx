import React, { useEffect, useState, useRef } from "react";
import api from "../api";
import "../styles/Conversation.css";
import { ACCESS_TOKEN } from "../token";

const Conversation = ({ conversationId, currentUserId, onBack }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [typingUser, setTypingUser] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [socket, setSocket] = useState(null);
  const [chatPartner, setChatPartner] = useState(null);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    const fetchConversationData = async () => {
      if (!conversationId) {
        console.error("Invalid conversationId:", conversationId);
        return;
      }

      try {
        setLoading(true);
        const response = await api.get(`/conversations/${conversationId}/messages/`);
        const messages = response.data || [];
        setMessages(messages);

        if (messages.length > 0) {
          const participants = messages[0]?.participants || [];
          const chatPartner = participants.find((user) => user.id !== currentUserId);

          if (chatPartner) {
            setChatPartner(chatPartner);
          } else {
            console.error("No valid chat partner found");
          }
        }
      } catch (error) {
        console.error("Error fetching conversation data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchConversationData();
  }, [conversationId, currentUserId]);

  useEffect(() => {
    if (!conversationId) return;
    const token = localStorage.getItem(ACCESS_TOKEN);

    const websocket = new WebSocket(`ws://localhost:8000/ws/chat/${conversationId}/?token=${token}`);

    websocket.onopen = () => {
      console.log("WebSocket connection established");
    };

    websocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log(data)

        if (data.type === "chat_message") {
          const { message, user, timestamp } = data; 
            let senderObject; 
            if (user === currentUserId) { 
                senderObject = { id: currentUserId, username: "You" }; 
            } else if (chatPartner && user === chatPartner.id) { 
                senderObject = chatPartner;
            } else { 
                senderObject = { id: user, username: `User ${user}` };
            } 

          setMessages((prevMessages) => [
            ...prevMessages,
            { sender: senderObject, content: message, timestamp },
          ]);
          setTypingUser(null);
        } else if (data.type === "typing") {
          const { user, receiver } = data;

          if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
          }
 
          if (receiver === currentUserId && user.id !== currentUserId) {
            setTypingUser(user); 
            typingTimeoutRef.current = setTimeout(() => {
              setTypingUser(null);
              typingTimeoutRef.current = null;
            }, 2000);
          }
        } else if (data.type === "online_status") {
          if (data.status === "online") {
            setOnlineUsers((prev) => [...prev, ...data.online_user]);
          } else if (data.status === "offline") {
            setOnlineUsers((prev) =>
              prev.filter((user) => !data.online_users.some((u) => u.id === user.id))
            );
          }
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };

    websocket.onerror = (error) => {
      console.error("WebSocket Error:", error);
    };

    setSocket(websocket);

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      websocket.close();
    };
  }, [conversationId, currentUserId, chatPartner]);

  const handleSendMessage = () => {
    if (!conversationId || !newMessage.trim()) {
      console.error("Cannot send message: Invalid conversationId or empty message");
      return;
    }

    if (socket?.readyState === WebSocket.OPEN) {
      const messagePayload = {
        type: "chat_message",
        message: newMessage,
        user: currentUserId,
      };

      socket.send(JSON.stringify(messagePayload));
      setNewMessage("");
    } else {
      console.error("WebSocket is not open. Message not sent.");
    }
  };
 
  const handleTypingStart = () => {
    if (!chatPartner || socket?.readyState !== WebSocket.OPEN) return;
    const receiverId = chatPartner.id;
 
    if (!typingTimeoutRef.current) {
        socket.send(
            JSON.stringify({
                type: "typing",
                user: currentUserId,
                receiver: receiverId,
                is_typing: true,
            })
        );
    }
     
    clearTimeout(typingTimeoutRef.current);
 
    typingTimeoutRef.current = setTimeout(() => {
        socket.send(
            JSON.stringify({
                type: "typing",
                user: currentUserId,
                receiver: receiverId,
                is_typing: false,
            })
        );
        typingTimeoutRef.current = null;
    }, 1500);
};


  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  };

  const handleDeleteMessage = async (messageId) => {
    try {
      const response = await api.delete(`/conversations/${conversationId}/messages/${messageId}/`);
      if (response.status === 204) {
        setMessages((prevMessages) => prevMessages.filter((msg) => msg.id !== messageId));
      }
    } catch (error) {
      console.error("Error deleting message:", error);
    }
  };
  

  return (
    <div className="conversation-container">
      <div className="conversation-header">
        <button className="back-button" onClick={onBack}>Back</button>
        <h3>{chatPartner ? `Chat with ${chatPartner.username}` : "Chat"}</h3>
        <div className="online-status">
          {onlineUsers.length > 0 ? (
            onlineUsers.map((user) => (
              <span key={user.id} className="online-user">
                {user.username} (online)
              </span>
            ))
          ) : (
            <span>No users online</span>
          )}
        </div>
      </div>

      <div className="messages-container">
        {loading ? (
          <p>Loading messages...</p>
        ) : (
          messages.map((message, index) => {
            const currentUserIdInt = parseInt(currentUserId);
            const isSentByCurrentUser = message.sender?.id === currentUserIdInt;

            return (
              <div key={index} className={`message-wrapper ${isSentByCurrentUser ? "sent" : "received"}`}>
                {!isSentByCurrentUser && (
                  <span className="message-username">
                    {message.sender?.username || "Unknown"}
                  </span>
                )}
                <div className="message-bubble">
                  {message.content}
                  {isSentByCurrentUser && (
                    <button
                      className="delete-button"
                      onClick={() => handleDeleteMessage(message.id)}
                    >
                      Delete
                    </button>
                  )}
                </div>
                <div className="message-timestamp">{formatTimestamp(message.timestamp)}</div>
              </div>
            );
          })
        )}
      </div>

      {typingUser && (
        <div className="typing-indicator">
          {typingUser.username} is typing...
        </div>
      )}

      <div className="input-container">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => {
            setNewMessage(e.target.value) 
            handleTypingStart();
          }}
          // onKeyDown={handleTyping}
          placeholder="Type a message..."
          className="message-input"
        />
        <button className="send-button" onClick={handleSendMessage}>
          Send
        </button>
      </div>
    </div>
  );
};

export default Conversation;