import { Tag } from "antd";

// A Document Portal request's status, in words (server/modules/portal STATUSES).
const STATUS = {
  waiting: ["default", "In line"],
  pending: ["gold", "Awaiting decision"],
  approved: ["green", "Viewing"],
  declined: ["red", "Declined"],
  revoked: ["volcano", "Withdrawn"],
  expired: ["default", "Expired"],
  lapsed: ["default", "Lapsed"],
  left: ["default", "Left"],
  cancelled: ["default", "Left the line"],
};

export default function statusTag(status) {
  const [color, label] = STATUS[status] || ["default", status];
  return <Tag color={color}>{label}</Tag>;
}
