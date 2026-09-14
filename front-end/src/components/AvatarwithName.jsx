import React, { useEffect, useState } from "react";
import { Avatar } from "antd";
import DefaultAvatar from "./DefaultAvatar";
import { API_BASE_URL } from "../config/api";

const AvatarWithName = ({ userHandle, size = "30px" }) => {
    const [avatar, setAvatar] = useState(null);
    const [name, setName] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchUserData = async () => {
            try {
                // credentials: "include" is required. axios.defaults.withCredentials
                // in App.jsx does not apply to fetch, and fetch defaults to
                // "same-origin" — but the SPA and the API are different origins,
                // so the session cookie was never sent. Every request 401'd and
                // the header showed "Error: User not found" instead of the
                // signed-in user's name, on every screen.
                const response = await fetch(
                    `${API_BASE_URL}/api/users?username=${encodeURIComponent(userHandle)}`,
                    { credentials: "include" }
                );
                if (!response.ok) {
                    throw new Error("User not found");
                }
                const data = await response.json();
                const user = data[0];
                setName(user.name);
                // Only an uploaded photo counts. Older records could hold a
                // generated-cartoon config object here; those get the initials
                // tile like anyone without a photo.
                setAvatar(typeof user.avatar === "string" && user.avatar ? user.avatar : null);
            } catch (error) {
                setError(error.message);
                console.error("Error fetching user data:", error.message);
            } finally {
                setLoading(false);
            }
        };

        fetchUserData();
    }, [userHandle]);

    // The same tile in all three states — loading, failed, no photo — so the
    // slot never changes size and the same account always looks the same.
    if (loading || error || !avatar) {
        return (
            <div style={{ display: "flex", alignItems: "center" }}>
                <DefaultAvatar
                    name={name || userHandle}
                    size={size}
                    title={error ? `Could not load profile: ${error}` : name || undefined}
                />
            </div>
        );
    }

    return (
        <div style={{ display: "flex", alignItems: "center" }}>
            <Avatar
                src={`${API_BASE_URL}${avatar}`}
                alt="Profile Picture"
                style={{ width: size, height: size, flex: "none" }}
            />
        </div>
    );
};

export default AvatarWithName;
