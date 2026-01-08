import { Response } from "express";

export function sendSuccess<T>(res: Response, data: T, status = 200) {
  return res.status(status).json(data);
}

export function sendCreated<T>(res: Response, data: T) {
  return sendSuccess(res, data, 201);
}
