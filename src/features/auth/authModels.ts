export interface StudentProfile {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}

export interface AuthSession {
  token: string;
  student: StudentProfile;
}
