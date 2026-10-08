// src/api/cobranzaApi.ts
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

const baseUrl = import.meta.env.VITE_BASE_MIDDLEWARE;
const path = "/api/v1/cobranza";

export const cobranzaApi = createApi({
    reducerPath: 'cobranzaApi',
    baseQuery: fetchBaseQuery({

        baseUrl: baseUrl + path, prepareHeaders: (headers) => {
            // const token = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiI3IiwianRpIjoiZmQxYzAxNjYzZjUwM2MzZjE5ZTE0MzQ5OTUyMzEzZDViNjkxZjZmOTg3NzUyODk2OWMxNTIyNzNlMTBjZGRmODg3YjAxY2Q3MDVkMTBkODgiLCJpYXQiOjE3NDY2NDU2NDAuOTcwNzAxLCJuYmYiOjE3NDY2NDU2NDAuOTcwNzA0LCJleHAiOjE3NzgxODE2NDAuOTUyOTQsInN1YiI6IjYiLCJzY29wZXMiOltdfQ.dgFWQb7VYOgFRI8QBqL1RbKQwJwliGs0i2qK3R3HhbZxmMwnxdjskuumq_qw7Nb0XFLVj92nm4FVRY3c901ppUxmux0zJBtCL97z3JWMtL6DVaOeih3nKD4XsD98bMKegjOAUwEY98QvgEDrH3javv_quie4Ro5brMs9NYpOBELmmkJ0tFUeReHBqXynX9jBRB6T4PGRzClvngsa1bJ1usr1oXDT3CBzq7A6lp0WUfL13wTYaFAi5o_JnuwLyp6uW1oa4PsquusvnPCDPDjAcenQic8Gk5uF7dU6rdOyj59WfITj3HLdyGeJsEcF-grMS9OLIzQSmAlC2KKQj6lmczBlklIWk_bfqTCnfJEtIXtGFiEvBjl7MPbLKH1W2H3gIqrlHFko1JYdJHy9VgldCxLk66GsskLNjKgs5s9r6zWaWNCGUnQYtbAclZ9gPWmZ8EnEZzeOB7gAHiXyS1zugMtt5AIyF6IIs4o57C72k0pJ2f-kLFOspNfHH6GH0FfnL0nVmiylAPSEWfC0GOZH1rzkO7ki5lMFbvpekc887-QRQhKPqNXiddqfFBFrsivCeJpE3ddqIsjqxyRABhgKOop_sHeb0WyqQ-FSeEkSk1AcH4jNS5DV-xdiqSx5t59ub_7VEsLUfp9HCsasJxp1t56SXpWiAjmSkkUm5l30lr4";
            // if (token) {
            //     headers.set('Authorization', `Bearer ${token}`)
            // }

            if (import.meta.env.VITE_BASE_NODE_ENV === 'PROD') {
                headers.set('x-merchant-id', 'LxG83peZ4W');
            } else {
                headers.set('x-merchant-id', '1000');
            }

            return headers
        },
    }),
    endpoints: (builder) => ({

        tokenizarTarjeta: builder.mutation<any, any>({
            query: (body) => ({
                url: `/tokens`,
                method: "POST",
                body,
            }),
        }),

    }),
})

export const {
    useTokenizarTarjetaMutation,

} = cobranzaApi
