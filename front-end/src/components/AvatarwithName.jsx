import React, { useEffect, useState } from "react";
import { Avatar } from "antd";
import NiceAvatar from "react-nice-avatar";

const AvatarWithName = ({ userHandle, size = "30px" }) => {
    const [avatar, setAvatar] = useState(null);
    const [name, setName] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchUserData = async () => {
            try {
                const response = await fetch(
                    `http://localhost:8081/api/users?username=${userHandle}`
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
                    src={`http://localhost:8081${avatar}`}
                    alt="Profile Picture"
                    style={{ width: size, height: size, marginRight: "8px" }}
                />
            ) : (
                renderOldAvatar()
            )}
        </div>
    );
};

export default AvatarWithName;
