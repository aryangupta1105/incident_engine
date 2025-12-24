module.exports = [
  {
    match: /emi.*failed/i,
    incident: {
      category: 'FINANCE',
      type: 'EMI_FAILED',
      severity: 'HIGH',
      consequence: '₹2000 penalty risk'
    }
  }
];
