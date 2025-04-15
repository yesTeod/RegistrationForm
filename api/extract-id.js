export default function handler(req, res) {
  res.status(200).json({ name: "Test", idNumber: "12345", expiry: "01/01/2099" });
}
