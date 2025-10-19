import { Response } from "express";

export function ok(res: Response, message: string, data?: any) {
  return res.status(200).json({ success: true, message, data });
}

export function created(res: Response, message: string, data?: any) {
  return res.status(201).json({ success: true, message, data });
}

export function badRequest(res: Response, message: string, data?: any) {
  return res.status(400).json({ success: false, message, data });
}

export function unauthorized(res: Response, message: string) {
  return res.status(401).json({ success: false, message });
}

export function forbidden(res: Response, message: string) {
  return res.status(403).json({ success: false, message });
}

export function notFound(res: Response, message: string) {
  return res.status(404).json({ success: false, message });
}

export function serverError(res: Response, message: string) {
  return res.status(500).json({ success: false, message });
}
