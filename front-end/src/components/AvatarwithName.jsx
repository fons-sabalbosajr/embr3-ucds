import React, { useState, useEffect } from "react";
import axios from "axios";
import NiceAvatar from "react-nice-avatar";

const AvatarWithName = () => {
  const [avatar, setAvatar] = useState(null);
  const [name, setName] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAvatar = async () => {
      try {
        const token = localStorage.getItem("jwtToken");
        const response = await axios.get(`https://embr3-ucds.onrender.com/api/current-user/avatar`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        setAvatar(response.data.avatar);
        setName(response.data.name);
      } catch (error) {
        console.error("Error fetching avatar:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAvatar();
  }, []);

  if (loading) {
    return <div>Loading...</div>;
  }


  return (
   <div>
      <NiceAvatar
        style={{ width: "30px", height: "30px" }}
        {...avatar}
      />
    </div>
  );
};

export default AvatarWithName;