function buildSortKeyQuery(idString) {
  if (typeof idString === 'string' && idString.includes('-')) {
    const parts = idString.split('-');
    const prefix = parts[0];
    const numberPart = parts[1];
    if (prefix && numberPart && /^\d+$/.test(numberPart)) {
      return { sort_key: { $regex: `^${prefix}-0*${numberPart}$`, $options: 'i' } };
    }
  }
  return { sort_key: idString };
}

module.exports = { buildSortKeyQuery };
