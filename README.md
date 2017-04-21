# MyType backend

(The front-end can be found in another [repository](https://github.com/orouvinen/mytype-frontend)).

## Installation
1. Clone the repo:
```
git clone https://github.com/orouvinen/mytype-backend.git
```
2. Install required packages and their dependencies:
```
$ cd mytype-backend
$ npm install
```

## Post-install configuration:

### Creating a database
Assuming PostgreSQL in installed, database installation requires the following steps:
**(Warning! The SQL script will re-create all existing tables, so be sure to back up
any data before running the script.)**
```
$ createdb mytype
$ psql mytype -f db/create-mytype-db.sql
``` 



### Environment configuration
Environment variables used for configuration must be put to file `.env`. Be sure to give
the file appropriate permissions (i.e. not readable by the world).


```
DATABASE_URL=postgre://user:password@host:port/database
PORT=server port num.
SECRET=private JWT signing key
```

`DATABASE_URL` and `SECRET` (which can be any string) are mandatory.
`PORT` will have default value if it is not provided here, but you might want
to be explicit about it and specify it here.

## Starting the server
```
$ npm start
```
