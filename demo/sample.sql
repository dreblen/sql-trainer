--#!Sample Database
CREATE TABLE Position (
    ID int PRIMARY KEY,
    Title varchar(255),
    WeeklyHours tinyint
);

CREATE TABLE Employee (
    ID int NOT NULL PRIMARY KEY,
    FirstName varchar(128) NOT NULL,
    LastName varchar(128) NOT NULL,
    HireDate date,
    TerminationDate date,
    PositionID int NOT NULL,
    FOREIGN KEY (PositionID) REFERENCES Position (ID)
);

INSERT INTO Position VALUES
(1, 'Professional Person', 40),
(2, 'Part-Time Worker', 25),
(3, 'Vacant Role', 35);

INSERT INTO Employee VALUES
(1, 'Jane', 'Doe', date('now'), NULL, 1),
(2, 'John', 'Doe', date('now', '-7 day'), date('now'), 2);
