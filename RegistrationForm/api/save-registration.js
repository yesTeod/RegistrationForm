import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    await client.connect();
    const db = client.db("users");
    const collection = db.collection("registrations");

    const data = req.body;
    await collection.insertOne(data);

    res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
}
