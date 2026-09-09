import React, { useEffect, useState } from "react";
import { Avatar } from "antd";
import NiceAvatar from "react-nice-avatar";
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

                if (typeof user.avatar === 'string') {
                    setAvatar(user.avatar);
                } else if (typeof user.avatar === 'object' && user.avatar !== null) {
                    setAvatar(user.avatar);
                }
            } catch (error) {
                setError(error.message);
                console.error("Error fetching user data:", error.message);
            } finally {
                setLoading(false);
            }
        };

        fetchUserData();
    }, [userHandle]);

    if (loading) {
        return <span>Loading...</span>;
    }

    if (error) {
        return <span>Error: {error}</span>;
    }

    const renderOldAvatar = () => {
        if (avatar) {
            return (
                <NiceAvatar
                    style={{ width: size, height: size}}
                    {...avatar}
                />
            );
        }
        return null;
    };

    return (
        <div style={{ display: "flex", alignItems: "center" }}>
            {typeof avatar === 'string' ? (
                <Avatar
                    src={`${API_BASE_URL}${avatar}`}
                    alt="Profile Picture"
                    style={{ width: size, height: size }}
                />
            ) : (
                renderOldAvatar()
            )}
        </div>
    );
};

export default AvatarWithName;
