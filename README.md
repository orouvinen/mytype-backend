# MyType backend

## Installation
    npm install

## Post-install configuration:

Environment variables used for configuration must be put to file `.env`. Be sure to give
the file appropriate permissions (i.e. not readable by the world).


```
DATABASE_URL=postgre://user:password@host:port/database
PORT=server port num.
SECRET=private JWT signing key
```

`DATABASE_URL` and `SECRET` are mandatory.
`PORT` will have default value if it is not provided here, but you might want
to be explicit about it and specify it here.

## Starting
`npm start`
