import NasSettings from "../settings/NasSettings";

// Storage Configuration and Settings were two routes onto the same thing, and
// keeping two half-built screens meant neither said where the real controls
// were. Both now render the configuration screen, so the existing sidebar link
// and any saved bookmark still work.
const NasStorageConfig = () => <NasSettings />;

export default NasStorageConfig;
