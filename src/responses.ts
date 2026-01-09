import { Response } from "express";

export interface ApiResponse<T> {
  success: boolean;
  status: number;
  message: string;
  data: T;
}

export function sendSuccess<T>(res: Response, data: T, status = 200, message = "Request successful") {
  const response: ApiResponse<T> = {
    success: true,
    status,
    message,
    data,
  };
  return res.status(status).json(response);
}

export function sendCreated<T>(res: Response, data: T, message = "Resource created successfully") {
  return sendSuccess(res, data, 201, message);
}

export function sendError(res: Response, message: string, status = 500) {
  const response: ApiResponse<null> = {
    success: false,
    status,
    message,
    data: null,
  };
  return res.status(status).json(response);
}
