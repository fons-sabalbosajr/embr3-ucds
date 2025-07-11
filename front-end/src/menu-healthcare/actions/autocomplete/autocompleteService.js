const API_URL = "http://10.14.77.107:8081/api/healthcare";

export const fetchProponentNames = async (query) => {
  const response = await fetch(API_URL, {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to fetch healthcare data");
  const data = await response.json();

  // Filter and map unique proponent names based on the 'name' field
  const names = Array.from(
    new Set(
      data
        .filter((item) =>
          item.name &&
          item.name.toLowerCase().includes(query.toLowerCase())
        )
        .map((item) => item.name)
    )
  ).map((name) => ({
    value: name,
    label: name,
  }));

  return names;
};

export const fetchProjectTitles = async (query) => {
  const response = await fetch(API_URL, {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) throw new Error("Failed to fetch healthcare data");
  const data = await response.json();

  // Filter and map unique project titles based on the 'project_title' field
  const titles = Array.from(
    new Set(
      data
        .filter(
          (item) =>
            item.title &&
            item.title.toLowerCase().includes(query.toLowerCase())
        )
        .map((item) => item.title)
    )
  ).map((title) => ({
    value: title,
    label: title,
  }));

  return titles;
};