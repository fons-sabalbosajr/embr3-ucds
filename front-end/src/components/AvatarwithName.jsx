import React, { useEffect, useState } from "react";
import { Avatar } from "antd";
import NiceAvatar from "react-nice-avatar";

const AvatarWithName = ({ userHandle }) => {
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
                    throw new Error("User  not found");
                }
                const data = await response.json();
                const user = data[0];
                setName(user.name); // Set the user's name

                // Check if avatar is an object (old format) or a string (new format)
                if (typeof user.avatar === 'string') {
                    setAvatar(user.avatar); // New format
                } else if (typeof user.avatar === 'object' && user.avatar !== null) {
                    // Old format - create a default avatar based on the data
                    setAvatar(user.avatar); // Keep the avatar object for rendering
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
        return <span>Loading...</span>; // You can replace this with a spinner or placeholder
    }

    if (error) {
        return <span>Error: {error}</span>; // Display error message if fetching fails
    }

    // Function to render the old avatar format
    const renderOldAvatar = () => {
        if (avatar) {
            return (
                <NiceAvatar
                    style={{ width: "30px", height: "30px", marginRight: "8px" }}
                    {...avatar} // Spread the avatar properties to NiceAvatar
                />
            );
        }
        return null; // Fallback if no avatar data
    };

    return (
        <div style={{ display: "flex", alignItems: "center" }}>
            {typeof avatar === 'string' ? (
                <Avatar
                    src={`http://localhost:8081${avatar}`} // Ensure the URL is correct
                    alt="Profile Picture"
                    style={{ width: "30px", height: "30px", marginRight: "8px" }}
                />
            ) : (
                renderOldAvatar() // Render the old avatar format
            )}
        </div>
    );
};

export default AvatarWithName;