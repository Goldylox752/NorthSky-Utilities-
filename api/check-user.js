let users = [];

export default function handler(req, res) {
  const { email } = req.body;

  const user = users.find(u => u.email === email);

  res.json({ paid: user?.paid || false });
}