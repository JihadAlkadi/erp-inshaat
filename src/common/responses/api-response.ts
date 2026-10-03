export interface ApiSuccessResponse<T> {
  success: true;
  message?: string;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  code: string;
  message: string;
  errors?: unknown;
}

export class ApiResponse {
  public static success<T>(data: T, message?: string): ApiSuccessResponse<T> {
    const response: ApiSuccessResponse<T> = {
      success: true,
      data,
    };

    if (message !== undefined && message !== '') {
      response.message = message;
    }

    return response;
  }

  public static error(
    message: string,
    code: string = 'INTERNAL_SERVER_ERROR',
    errors?: unknown
  ): ApiErrorResponse {
    const response: ApiErrorResponse = {
      success: false,
      code,
      message,
    };

    if (errors !== undefined) {
      response.errors = errors;
    }

    return response;
  }
}
