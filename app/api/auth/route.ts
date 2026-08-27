import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  try {
    const { password } = await req.json();
    const envPassword = process.env.PASSWORD;
    
    if (!envPassword) {
      return NextResponse.json({ success: true });
    }

    if (password === envPassword) {
      // Set cookie that expires in 30 days
      cookies().set("site-auth", envPassword, { 
        httpOnly: true, 
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30 
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } catch (err) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
