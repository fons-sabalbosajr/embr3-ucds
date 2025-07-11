import axios from "axios";

export const fetchHealthcareData = async () => {
  const response = await fetch("http://10.14.77.107:8081/api/healthcare", {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText);
  }
  return response.json();
};