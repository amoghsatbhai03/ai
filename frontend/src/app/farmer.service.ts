import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Farmer {
  farmer_id: number;
  name: string;
  village: string;
  sugarcane_tons: number;
  payment_pending: number;
  amount_paid: number;
}

@Injectable({
  providedIn: 'root'
})
export class FarmerService {
  private api = 'http://localhost:3000/api';

  constructor(private http: HttpClient) {}

  getFarmers(): Observable<Farmer[]> {
    return this.http.get<Farmer[]>(`${this.api}/farmers`);
  }

  askAI(question: string): Observable<{ answer: string }> {
    return this.http.post<{ answer: string }>(
      `${this.api}/ask`,
      { question }
    );
  }
}