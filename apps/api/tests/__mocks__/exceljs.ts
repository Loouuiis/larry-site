// Stub for exceljs package — not installed in test environment.
export default {
  Workbook: class {
    addWorksheet() {
      return {
        columns: [],
        getRow: () => ({ font: {}, fill: {}, alignment: {}, eachCell: () => {} }),
        addRow: () => ({ fill: {}, alignment: {} }),
      };
    }
    xlsx = { writeBuffer: async () => Buffer.from("") };
  },
};
